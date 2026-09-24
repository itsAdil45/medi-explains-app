import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Field({
  label,
  disabled,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  disabled?: boolean;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="flex-1">
      <Text className="mb-1 text-xs font-semibold text-slate-700">{label}</Text>
      <TextInput
        editable={!disabled}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        className={`h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 ${disabled ? "bg-slate-50 text-slate-500" : "bg-white"}`}
      />
    </View>
  );
}

export default function MedicationEditor({
  consultationId,
  index,
  med,
  readOnly,
  onChange,
}: {
  consultationId: string;
  index: number;
  med: any;
  readOnly?: boolean;
  onChange?: (updated: any) => void;
}) {
  const [draft, setDraft] = useState<any>(med || {});
  const [suggestions, setSuggestions] = useState<any[]>(med?.suggestions || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(med || {});
    setSuggestions(med?.suggestions || []);
  }, [med]);

  const extraction = typeof draft.confidence === "number" ? draft.confidence : null;
  const match = typeof draft.match_confidence === "number" ? draft.match_confidence : (suggestions?.[0]?.score ?? null);
  const set = (k: string, v: any) => setDraft((x: any) => ({ ...x, [k]: v }));

  async function save(confirm = false) {
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.updateMedication(consultationId, index, {
        name: draft.name,
        concept_id: draft.concept_id,
        dose: draft.dose,
        strength: draft.strength,
        dose_unit: draft.dose_unit,
        dosage_form: draft.dosage_form,
        route: draft.route,
        frequency: draft.frequency,
        timing: draft.timing,
        food_instruction: draft.food_instruction,
        duration: draft.duration,
        as_needed: !!draft.as_needed,
        indication: draft.indication,
        notes: draft.notes,
        confirm_identity: confirm,
        confirm_instructions: confirm,
      });
      onChange?.(updated);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function lookup() {
    const q = draft.name || draft.name_as_heard || "";
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      setSuggestions(await api.suggestMedications(q, 8));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function choose(s: any) {
    // Reference terminology verifies identity only. It NEVER inserts a common dose.
    setDraft((x: any) => ({
      ...x,
      concept_id: s.concept_id,
      name: s.display_name || s.generic_name,
      canonical_name: s.display_name,
      generic_name: s.generic_name,
      brand_name: s.brand_name,
      strength: x.strength || s.strength || "",
      dosage_form: x.dosage_form || s.dosage_form || "",
      match_confidence: s.score,
      doctor_confirmed: false,
    }));
  }

  function remove() {
    Alert.alert("Remove medication", "Remove this medication from the consultation?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            onChange?.(await api.removeMedication(consultationId, index));
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View className="rounded-lg border border-slate-200 p-4">
      <View className="mb-3 flex-row flex-wrap items-center gap-1.5">
        {extraction != null && <Badge tone="slate">Extraction {Math.round(extraction * 100)}%</Badge>}
        {match != null && <Badge tone="slate">Drug match {Math.round(match * 100)}%</Badge>}
        {draft.doctor_confirmed ? (
          <Badge tone="green">{"\u2713"} Doctor confirmed</Badge>
        ) : (
          <Badge tone="amber">Needs doctor confirmation</Badge>
        )}
        {draft.name_as_heard && (
          <Text className="text-xs text-slate-500">heard as: "{draft.name_as_heard}"</Text>
        )}
      </View>

      <View className="gap-3">
        <Field label="Medication name" disabled={readOnly} value={draft.name || ""} onChangeText={(t) => set("name", t)} />

        <View className="flex-row flex-wrap gap-3">
          <Field label="Strength" disabled={readOnly} value={draft.strength || ""} onChangeText={(t) => set("strength", t)} placeholder="e.g. 500 mg" />
          <Field label="Dose" disabled={readOnly} value={draft.dose || ""} onChangeText={(t) => set("dose", t)} placeholder="e.g. 1 tablet" />
        </View>
        <View className="flex-row flex-wrap gap-3">
          <Field label="Frequency" disabled={readOnly} value={draft.frequency || ""} onChangeText={(t) => set("frequency", t)} placeholder="e.g. twice daily" />
          <Field label="Timing" disabled={readOnly} value={draft.timing || ""} onChangeText={(t) => set("timing", t)} placeholder="morning / night" />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <Field label="Food instruction" disabled={readOnly} value={draft.food_instruction || ""} onChangeText={(t) => set("food_instruction", t)} placeholder="after food" />
          <Field label="Duration" disabled={readOnly} value={draft.duration || ""} onChangeText={(t) => set("duration", t)} placeholder="e.g. 5 days" />
        </View>
        <Field label="Route / form" disabled value={[draft.route, draft.dosage_form].filter(Boolean).join(" / ")} placeholder="oral / tablet" />

        <Field label="Notes" disabled={readOnly} value={draft.notes || ""} onChangeText={(t) => set("notes", t)} />
      </View>

      {!readOnly && (
        <View className="mt-3 flex-row flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onPress={() => save(false)}>
            Save edits
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onPress={lookup}>
            Look up real medicine matches
          </Button>
          <Button size="sm" disabled={busy} onPress={() => save(true)}>
            Confirm identity & instructions
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onPress={remove}>
            Remove
          </Button>
        </View>
      )}

      {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

      {suggestions?.length > 0 && (
        <View className="mt-3 gap-1.5 border-t border-dashed border-slate-200 pt-3">
          <Text className="text-xs text-slate-500">
            Candidate matches from installed RxNorm/DRAP terminology. Choosing one does not confirm a dose.
          </Text>
          {suggestions.map((s, i) => (
            <Pressable
              key={i}
              disabled={readOnly}
              onPress={() => choose(s)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <Text className="text-sm font-semibold text-slate-900">
                {s.display_name || s.generic_name}
                {s.source && <Text className="text-xs font-normal text-slate-500"> {"\u00b7"} {s.source.toUpperCase()}</Text>}
              </Text>
              <Text className="text-xs text-slate-500">
                {s.brand_name ? `Brand: ${s.brand_name} \u00b7 ` : ""}
                {s.strength || ""}
                {s.score != null ? ` \u00b7 match ${Math.round(s.score * 100)}%` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
