import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { RefreshCw, Plus, CheckCircle2, ShieldCheck, Check } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LanguagePicker from "@/components/LanguagePicker";
import PrescriptionUpload from "@/components/PrescriptionUpload";
import ShareDialog from "@/components/ShareDialog";
import MedicationEditor from "@/components/MedicationEditor";
import TranscriptReview from "@/components/TranscriptReview";
import SafetyChecks from "@/components/SafetyChecks";

const LOCKED_AFTER = ["approved", "released", "under_cross_check", "cross_checked"];
const MED_LOCKED_AFTER = ["released", "under_cross_check", "cross_checked"];

const TABS = [
  { key: "transcript", label: "Transcript" },
  { key: "summary", label: "Patient Summary" },
  { key: "safety", label: "Safety Review" },
  { key: "medications", label: "Medications" },
] as const;

// Small dot next to a tab label - a quick "does this need me" signal
// without clicking into every tab. Shape/icon carries the meaning, not just
// color (readable for red-green color blindness), and the accessibilityLabel
// gives the same signal to a screen reader.
function TabDot({ tone }: { tone: "good" | "warning" | null }) {
  if (!tone) return null;
  if (tone === "good") {
    return (
      <View className="size-4 items-center justify-center rounded-full bg-emerald-500" accessibilityLabel="all resolved">
        <Check size={11} color="#fff" strokeWidth={3.5} />
      </View>
    );
  }
  return (
    <View
      className="size-4 items-center justify-center rounded-full bg-red-500"
      accessibilityLabel="needs attention"
    >
      <Text className="text-[11px] font-black leading-none text-white">!</Text>
    </View>
  );
}

export default function DoctorReview({
  c,
  setC,
  edit,
  setEdit,
  meds,
  langMeta,
  rtl,
  busy,
  editableSummary,
  transcriptStale,
  approve,
  release,
  regenerateReviewed,
  retranslate,
  addMed,
  refresh,
  reviews,
  doctors,
}: {
  c: any;
  setC: (c: any) => void;
  edit: string;
  setEdit: (s: string) => void;
  meds: any[];
  langMeta: any;
  rtl?: boolean;
  busy: boolean;
  editableSummary: boolean;
  transcriptStale: boolean;
  approve: () => void;
  release: () => void;
  regenerateReviewed: () => void;
  retranslate: (lang: string) => void;
  addMed: () => void;
  refresh: () => void;
  reviews: any[];
  doctors: any[];
}) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("transcript");
  const [safetyCounts, setSafetyCounts] = useState({ total: 0, needReview: 0, passed: 0 });

  const englishTranscript =
    c.model_metadata?.doctor_transcript_en ||
    (c.languages_detected?.length === 1 && c.languages_detected[0] === "en" ? c.raw_transcript || "" : "");

  const unconfirmedMeds = meds.filter((m) => !m.doctor_confirmed).length;

  function tabTone(key: string): "good" | "warning" | null {
    if (key === "transcript" || key === "summary") return transcriptStale ? "warning" : null;
    if (key === "safety") {
      if (safetyCounts.needReview > 0) return "warning";
      if (safetyCounts.total > 0) return "good";
      return null;
    }
    if (key === "medications") {
      if (unconfirmedMeds > 0) return "warning";
      if (meds.length > 0) return "good";
      return null;
    }
    return null;
  }

  function tabBadgeCount(key: string) {
    if (key === "safety" && safetyCounts.needReview > 0) return safetyCounts.needReview;
    if (key === "medications" && unconfirmedMeds > 0) return unconfirmedMeds;
    return null;
  }

  // Jump the doctor straight to whatever's actually blocking, instead of
  // just showing an error. Mirrors what the backend gates on: /approve
  // blocks on unresolved safety warnings, /release blocks on unconfirmed
  // medication identity.
  function handleApproveClick() {
    if (safetyCounts.needReview > 0) {
      setActiveTab("safety");
      return;
    }
    approve();
  }

  function handleReleaseClick() {
    if (unconfirmedMeds > 0) {
      setActiveTab("medications");
      return;
    }
    release();
  }

  return (
    <View className="gap-5">
      <View className="flex-row gap-2">
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md border px-2 py-2 ${
              activeTab === t.key ? "border-[#4ab96a] bg-[#4ab96a]" : "border-slate-200 bg-white"
            }`}
          >
            <Text className={`text-[12px] font-semibold ${activeTab === t.key ? "text-white" : "text-slate-600"}`}>
              {t.label}
            </Text>
            <TabDot tone={tabTone(t.key)} />
            {tabBadgeCount(t.key) != null && (
              <View className="size-4 items-center justify-center rounded-full bg-red-500">
                <Text className="text-[10px] font-bold text-white">{tabBadgeCount(t.key)}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {activeTab === "transcript" && (
        <View className="gap-4.5">
          {c.code_switched && (
            <View className="rounded-lg bg-violet-50 px-4 py-3">
              <Text className="text-[13px] text-violet-900">
                <Text className="font-bold">Mixed-language transcription mode was used.</Text> The raw STT
                output is preserved. Corrections below create a reviewed transcript rather than silently
                replacing it.
              </Text>
            </View>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Original transcript {"\u2014"} immutable source</CardTitle>
              <CardDescription>
                Original speech is preserved in its correct writing system. Hindi/Devanagari is not
                accepted for Urdu, Punjabi Shahmukhi, Pashto, Sindhi or Arabic.
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-4">
              <TextInput
                editable={false}
                value={c.raw_transcript || ""}
                multiline
                className={`min-h-[140px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800 ${
                  ["ur", "pa_shah", "ps", "sd", "ar"].includes(c.stt_primary_language)
                    ? "text-right text-[15px] leading-loose"
                    : ""
                }`}
                style={
                  ["ur", "pa_shah", "ps", "sd", "ar"].includes(c.stt_primary_language)
                    ? { writingDirection: "rtl" }
                    : undefined
                }
              />
              <View>
                <Text className="mb-1.5 text-[13px] font-bold text-slate-900">
                  Doctor working transcript {"\u2014"} English
                </Text>
                <TextInput
                  editable={false}
                  value={englishTranscript}
                  placeholder="Faithful English translation for clinical review. This is not a summary."
                  placeholderTextColor="#94a3b8"
                  multiline
                  className="min-h-[100px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800"
                />
              </View>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI clinical note {"\u2014"} SOAP draft</CardTitle>
              <CardDescription>Independently generated from the source transcript.</CardDescription>
            </CardHeader>
            <CardContent>
              <TextInput
                editable={false}
                value={c.clinical_note || ""}
                multiline
                className="min-h-[180px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segment-level transcript review</CardTitle>
            </CardHeader>
            <CardContent>
              <TranscriptReview
                consultationId={c.id}
                readOnly={LOCKED_AFTER.includes(c.status)}
                onChanged={refresh}
              />
            </CardContent>
          </Card>

          {transcriptStale && (
            <View className="rounded-lg bg-red-50 px-4 py-3.5">
              <Text className="mb-1 text-[13px] font-bold text-red-900">
                {"\u26a0"} Transcript changed by the doctor
              </Text>
              <Text className="mb-1 text-[13px] text-red-900">
                The existing clinical note, patient summary, medication extraction, safety checks,
                translation and audio were created from the previous transcript.
              </Text>
              <Text className="mb-3 text-[13px] text-red-900">
                Regenerate the AI outputs before reviewing or approving the patient summary.
              </Text>
              <Button size="sm" onPress={regenerateReviewed} disabled={busy} loading={busy}>
                <View className="flex-row items-center gap-1.5">
                  <RefreshCw size={14} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    {busy ? "Regenerating\u2026" : "Regenerate from doctor-reviewed transcript"}
                  </Text>
                </View>
              </Button>
            </View>
          )}
        </View>
      )}

      {activeTab === "summary" && (
        <Card>
          <CardHeader>
            <CardTitle>Patient-friendly summary</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            {transcriptStale && (
              <View className="rounded-lg bg-red-50 px-4 py-3">
                <Text className="text-[13px] text-red-900">
                  This summary is outdated because the transcript was corrected. Regenerate it before
                  making final edits.
                </Text>
              </View>
            )}
            <TextInput
              value={edit}
              onChangeText={setEdit}
              editable={editableSummary}
              multiline
              className={`min-h-[150px] rounded-lg border border-slate-200 p-3.5 text-sm text-slate-800 ${editableSummary ? "bg-white" : "bg-slate-50 text-slate-500"}`}
            />
            <Text className="text-xs text-slate-500">
              SOAP and patient explanation are generated independently. Final patient text is translated
              and converted to speech from the doctor-approved version.
            </Text>

            {c.patient_summary_translated && c.patient_language !== "en" && (
              <View className="mt-1 border-t border-slate-200 pt-4">
                <Text className="mb-2 text-[13px] font-bold text-slate-900">
                  Translation preview ({langMeta?.native || c.patient_language})
                </Text>
                <View className={`mb-2.5 rounded-lg px-3.5 py-2.5 ${c.translation_verified ? "bg-emerald-50" : "bg-red-50"}`}>
                  <Text className={`text-[13px] ${c.translation_verified ? "text-emerald-900" : "text-red-900"}`}>
                    {c.translation_verified
                      ? "\u2713 Numeric/script integrity checks passed."
                      : "\u26a0 Translation requires doctor review before release."}
                    {c.translation_quality ? ` Status: ${c.translation_quality}.` : ""}
                  </Text>
                </View>
                <TextInput
                  editable={false}
                  value={c.patient_summary_translated}
                  multiline
                  className="min-h-[110px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800"
                  style={rtl ? { writingDirection: "rtl" } : undefined}
                />
              </View>
            )}

            <View>
              <Text className="mb-1.5 text-[13px] font-bold text-slate-900">Patient output language</Text>
              <LanguagePicker value={c.patient_language} onChange={retranslate} disabled={busy || transcriptStale} />
            </View>
          </CardContent>
        </Card>
      )}

      {activeTab === "safety" && (
        <Card>
          <CardHeader>
            <View className="flex-row items-center gap-1.5">
              <ShieldCheck size={16} color="#0f172a" />
              <CardTitle>Automated safety review</CardTitle>
            </View>
          </CardHeader>
          <CardContent>
            <SafetyChecks consultationId={c.id} canResolve onStatusChange={setSafetyCounts} />
          </CardContent>
        </Card>
      )}

      {activeTab === "medications" && (
        <View className="gap-4.5">
          <Card>
            <CardHeader>
              <CardTitle>Prescription OCR</CardTitle>
            </CardHeader>
            <CardContent>
              {LOCKED_AFTER.includes(c.status) ? (
                <Text className="text-xs text-slate-500">Prescription processing is locked after doctor approval.</Text>
              ) : (
                <PrescriptionUpload consultationId={c.id} onExtracted={refresh} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Medications{" "}
                <Text className="text-xs font-normal text-slate-500">
                  {"\u2014"} extraction, terminology-match and doctor confirmation are separate
                </Text>
              </CardTitle>
            </CardHeader>
            <CardContent className="gap-2.5">
              {!meds.length && <Text className="text-xs text-slate-500">No medication instructions extracted.</Text>}
              {meds.map((m, i) => (
                <MedicationEditor
                  key={`${i}-${m.name || ""}`}
                  consultationId={c.id}
                  index={i}
                  med={m}
                  readOnly={MED_LOCKED_AFTER.includes(c.status)}
                  onChange={setC}
                />
              ))}
              {!MED_LOCKED_AFTER.includes(c.status) && (
                <Button variant="secondary" size="sm" onPress={addMed} disabled={busy}>
                  <View className="flex-row items-center gap-1.5">
                    <Plus size={14} color="#334155" />
                    <Text className="text-sm font-semibold text-slate-700">Add medication manually</Text>
                  </View>
                </Button>
              )}
            </CardContent>
          </Card>
        </View>
      )}

      {/* Action bar - always visible regardless of active tab, so
          approve/release/cross-check/share are never hidden inside a tab
          the doctor isn't currently looking at. */}
      <View className="gap-4.5 border-t border-slate-200 pt-5">
        {editableSummary && (
          <Button onPress={handleApproveClick} disabled={busy} loading={busy}>
            <View className="flex-row items-center gap-1.5">
              <CheckCircle2 size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">
                {busy ? "Working\u2026" : "Approve reviewed patient summary"}
              </Text>
            </View>
          </Button>
        )}

        {c.status === "approved" && (
          <Card>
            <CardHeader>
              <CardTitle>Medication schedule approval</CardTitle>
            </CardHeader>
            <CardContent className="gap-3">
              <View className="rounded-lg bg-amber-50 px-3.5 py-3">
                <Text className="text-[13px] text-amber-900">
                  Review each medicine's dose, frequency, timing and duration before release. AI
                  Healthcare+ generates reminders only from doctor-confirmed instructions.
                </Text>
              </View>
              <View className="gap-1 pl-1">
                <Text className="text-[13px] text-slate-700">{"\u2022"} Confirm the medication identity.</Text>
                <Text className="text-[13px] text-slate-700">{"\u2022"} Confirm the dose and frequency.</Text>
                <Text className="text-[13px] text-slate-700">{"\u2022"} Enter a duration for fixed medication schedules.</Text>
                <Text className="text-[13px] text-slate-700">{"\u2022"} Use PRN / as-needed only when no fixed alarm is appropriate.</Text>
              </View>
              <Button onPress={handleReleaseClick} disabled={busy} loading={busy}>
                {busy ? "Generating schedule\u2026" : "\u2713 Approve medication schedule & release to patient"}
              </Button>
            </CardContent>
          </Card>
        )}

        {reviews.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Cross-check reviews</CardTitle>
            </CardHeader>
            <CardContent className="gap-2.5">
              {reviews.map((r) => {
                const d = doctors.find((x) => x.id === r.reviewer_id);
                const concerning = r.verdict === "disagree" || r.verdict === "flag";
                return (
                  <View key={r.id} className={`rounded-lg px-3.5 py-3 ${concerning ? "bg-red-50" : "bg-emerald-50"}`}>
                    <Text className={`text-[13px] ${concerning ? "text-red-900" : "text-emerald-900"}`}>
                      <Text className="font-bold">{d?.full_name || `Doctor #${r.reviewer_id}`}</Text>
                      {" \u00b7 "}
                      {r.request_status}
                      {" \u00b7 "}
                      {r.verdict}
                    </Text>
                    {r.reason && (
                      <Text className={`mt-1 text-[13px] ${concerning ? "text-red-900" : "text-emerald-900"}`}>
                        Reason: {r.reason}
                      </Text>
                    )}
                    {r.comments && (
                      <Text className={`mt-1 text-[13px] ${concerning ? "text-red-900" : "text-emerald-900"}`}>
                        Comment: {r.comments}
                      </Text>
                    )}
                  </View>
                );
              })}
            </CardContent>
          </Card>
        )}

        {c.released_at && (
          <Card>
            <CardContent className="pt-5">
              <ShareDialog consultationId={c.id} />
            </CardContent>
          </Card>
        )}
      </View>
    </View>
  );
}
