import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { CheckCircle2, ShieldAlert, Check } from "lucide-react-native";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TYPE_ORDER = ["nli_grounding", "medication_match", "translation_integrity", "stt_confidence"];

const TYPE_LABEL: Record<string, string> = {
  stt_confidence: "Speech confidence",
  nli_grounding: "Summary grounding",
  medication_match: "Medication identity",
  translation_integrity: "Translation integrity",
};

const TYPE_HINT: Record<string, string> = {
  stt_confidence: "Review every highlighted speech segment in the Transcript Review section before checking these off.",
  nli_grounding: "Each claim below is one sentence from the patient-facing summary. Correct or regenerate the summary if a claim is wrong \u2014 only check off claims you have verified against the consultation.",
  translation_integrity: "Translation warnings require explicit clinician verification \u2014 check medicine name, dose, frequency, duration, numbers, negation and clinical meaning before checking off.",
  medication_match: "Confirm medication identity in the Medications panel; check off here once you have reconciled it.",
};

function label(v: string) {
  return TYPE_LABEL[v] || v.replaceAll("_", " ");
}

// Same confirm-flag logic the single-item resolve endpoint has always used,
// now applied per item inside one batched submit instead of one popup each.
function resolveFlags(check: any) {
  const isTranslation = check.check_type === "translation_integrity";
  const isGrounding = check.check_type === "nli_grounding" && ["warning", "fail"].includes(check.status);
  return { confirmTranslation: isTranslation, confirmGrounding: isGrounding };
}

export default function SafetyChecks({
  consultationId,
  canResolve = false,
  onStatusChange,
}: {
  consultationId: string;
  canResolve?: boolean;
  onStatusChange?: (counts: { total: number; needReview: number; passed: number }) => void;
}) {
  const [checks, setChecks] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setErr(null);
      setChecks(await api.safetyChecks(consultationId));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [consultationId]);

  // Only warning/fail checks actually block approval/release on the backend
  // - passing checks need no explicit sign-off.
  const reviewable = useMemo(
    () => checks.filter((c) => !c.resolved && ["warning", "fail"].includes(c.status)),
    [checks],
  );

  useEffect(() => {
    onStatusChange?.({
      total: checks.length,
      needReview: reviewable.length,
      passed: checks.filter((c) => c.status === "pass").length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  const sections = useMemo(() => {
    const byType = new Map<string, any[]>();
    for (const c of checks) {
      if (!byType.has(c.check_type)) byType.set(c.check_type, []);
      byType.get(c.check_type)!.push(c);
    }
    const order = [...TYPE_ORDER, ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t))];
    return order.filter((t) => byType.has(t)).map((t) => ({ type: t, items: byType.get(t)! }));
  }, [checks]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === reviewable.length ? new Set() : new Set(reviewable.map((c) => c.id))));
  }

  async function confirmSelected() {
    setSubmitting(true);
    setErr(null);
    try {
      const items = checks.filter((c) => selected.has(c.id));
      await Promise.all(items.map((c) => api.resolveSafety(consultationId, c.id, resolveFlags(c))));
      setSelected(new Set());
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (err) return <Text className="text-xs font-medium text-red-600">{err}</Text>;

  if (!checks.length) {
    return <Text className="text-xs text-slate-500">No automated safety checks are stored for this consultation.</Text>;
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const needReviewCount = reviewable.length;
  const unavailableCount = checks.filter((c) => c.status === "unavailable").length;

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge tone="violet">{passCount} passed</Badge>
        <Badge tone="amber">{needReviewCount} need review</Badge>
        <Badge tone="slate">{unavailableCount} unavailable</Badge>
        {canResolve && reviewable.length > 0 && (
          <Pressable onPress={toggleAll} className="ml-auto">
            <Text className="text-xs font-semibold text-[#2f8f4e]">
              {selected.size === reviewable.length ? "Clear selection" : "Select all"}
            </Text>
          </Pressable>
        )}
      </View>

      {sections.map((section) => (
        <View key={section.type}>
          <Text className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {label(section.type)}
          </Text>
          <View className="gap-2">
            {section.items.map((ch) => {
              const warning = ch.status === "warning" || ch.status === "fail";
              const checkable = canResolve && !ch.resolved && warning;
              const hint = !ch.resolved && warning && TYPE_HINT[ch.check_type];
              const isSelected = selected.has(ch.id);

              return (
                <Pressable
                  key={ch.id}
                  disabled={!checkable}
                  onPress={() => checkable && toggle(ch.id)}
                  className={`flex-row items-start gap-3 rounded-lg px-3.5 py-3 ${
                    ch.status === "unavailable" ? "bg-slate-50" : warning ? "bg-red-50" : "bg-emerald-50"
                  }`}
                >
                  {checkable ? (
                    <View
                      className={`mt-0.5 size-4 shrink-0 items-center justify-center rounded border ${
                        isSelected ? "border-[#4ab96a] bg-[#4ab96a]" : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check size={11} color="#fff" strokeWidth={3} />}
                    </View>
                  ) : (
                    <View className="mt-0.5 shrink-0">
                      {ch.resolved || !warning ? (
                        <CheckCircle2 size={16} color="#059669" />
                      ) : (
                        <ShieldAlert size={16} color="#dc2626" />
                      )}
                    </View>
                  )}
                  <View className="min-w-0 flex-1">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text
                        className={`text-[13px] font-bold ${
                          ch.status === "unavailable" ? "text-slate-500" : warning ? "text-red-900" : "text-emerald-900"
                        }`}
                      >
                        {ch.status}
                      </Text>
                      {ch.score != null && (
                        <Text className="text-[13px] opacity-80">{"\u00b7"} {Math.round(ch.score * 100)}%</Text>
                      )}
                      {ch.resolved && <Badge tone="violet">Clinician reviewed</Badge>}
                    </View>
                    {ch.statement && <Text className="mt-1 text-[13px] text-slate-800">{ch.statement}</Text>}
                    {ch.evidence && (
                      <Text className="mt-1 text-[13px] italic text-slate-600">Evidence: {ch.evidence}</Text>
                    )}
                    {hint && <Text className="mt-1.5 text-xs text-slate-500">{hint}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* Not scroll-sticky like the website's - RN needs the surrounding
          ScrollView's own scroll offset to pin this, which ConsultationView
          doesn't track. Sits inline at the bottom of the safety tab instead. */}
      {canResolve && selected.size > 0 && (
        <View className="flex-row items-center justify-between rounded-lg border border-[#4ab96a]/30 bg-white px-4 py-3">
          <Text className="text-sm font-medium text-slate-900">{selected.size} selected</Text>
          <Button size="sm" onPress={confirmSelected} disabled={submitting} loading={submitting}>
            {`Confirm ${selected.size} reviewed`}
          </Button>
        </View>
      )}
    </View>
  );
}
