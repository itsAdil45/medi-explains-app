import { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, FlatList } from "react-native";
import { ChevronDown, Check } from "lucide-react-native";

import { api } from "@/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Doctor = { id: number; full_name: string; specialty?: string; clinic?: string };
type Review = {
  id: number;
  reviewer_id: number;
  request_status: string;
  created_at: string;
  verdict?: string;
  comments?: string;
};

const VERDICT_LABEL: Record<string, string> = {
  agree: "\u2713 Agrees with your treating doctor",
  partially_agree: "\u25D0 Partially agrees",
  disagree: "\u26A0 Disagrees with part of the treating plan",
  // The web build used a stray circled-number glyph here that isn't in most
  // mobile system fonts; a calendar emoji renders everywhere.
  suggest_followup: "\u{1F4C5} Suggests a follow-up visit",
  flag: "\u26A0 Flagged a concern",
};

// Web: agree -> .success, flag -> .quality-warning, everything else -> .quality-notice.
// The verdict text always carries its own glyph, so meaning isn't colour-only.
function verdictTone(verdict?: string) {
  if (verdict === "agree") return { box: "bg-emerald-50", text: "text-emerald-900" };
  if (verdict === "flag") return { box: "bg-red-50", text: "text-red-900" };
  return { box: "bg-amber-50", text: "text-amber-900" };
}

function doctorLabel(d: Doctor) {
  return `${d.full_name}${d.specialty ? ` \u00b7 ${d.specialty}` : ""}${d.clinic ? ` \u00b7 ${d.clinic}` : ""}`;
}

async function fetchCrossCheckData(consultationId: string | number, treatingDoctorId?: number) {
  const [docs, ccs] = await Promise.all([
    api.listDoctors(),
    api.crossChecksForConsultation(String(consultationId)),
  ]);
  return {
    // Exclude the treating doctor - they can't review their own case
    doctors: (docs as Doctor[]).filter((d) => d.id !== treatingDoctorId),
    reviews: ccs as Review[],
  };
}

/**
 * Patient-facing second-opinion panel.
 *
 * Appears on the patient view of a released consultation. Lets the patient:
 *   - pick a doctor (excluding their treating doctor) to request a review
 *   - see any pending requests they've already made
 *   - see verdicts + comments from reviewers
 *
 * The doctor on the same consultation sees the read-only verdict list via a
 * separate display in ConsultationView - this component is only rendered
 * for the patient.
 */
export default function PatientCrossCheck({
  consultation,
  onChange,
}: {
  consultation: { id: string | number; doctor_id?: number };
  onChange?: () => void;
}) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pickedId, setPickedId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchCrossCheckData(consultation.id, consultation.doctor_id)
      .then((data) => {
        if (!active) return;
        setDoctors(data.doctors);
        setReviews(data.reviews);
      })
      .catch((e: any) => active && setErr(e.message));
    return () => {
      active = false;
    };
  }, [consultation.id, consultation.doctor_id]);

  async function requestReview() {
    if (!pickedId) return setErr("Please choose a doctor to review your case.");
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      await api.requestCrossCheck({
        consultation_id: consultation.id,
        reviewer_id: Number(pickedId),
      });
      setSuccess("Your request has been sent. The doctor will review and reply soon.");
      setPickedId("");
      const data = await fetchCrossCheckData(consultation.id, consultation.doctor_id);
      setDoctors(data.doctors);
      setReviews(data.reviews);
      onChange?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pendingReviews = reviews.filter((r) => r.request_status !== "completed");
  const completedReviews = reviews.filter((r) => r.request_status === "completed");

  // IDs of doctors the patient has already asked -> hide from the picker so
  // they don't accidentally ask the same person twice.
  const askedAlready = new Set(reviews.map((r) => r.reviewer_id));
  const availableDoctors = doctors.filter((d) => !askedAlready.has(d.id));
  const picked = availableDoctors.find((d) => String(d.id) === pickedId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Want a second opinion?</CardTitle>
        <CardDescription>
          You can ask another doctor to review your summary. This does not change your prescription {"\u2014"} it
          just gives you a second medical view of your case.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {availableDoctors.length === 0 && reviews.length === 0 && (
          <Text className="text-xs text-slate-500">No other doctors are currently available for review.</Text>
        )}

        {availableDoctors.length > 0 && (
          <View className="gap-3">
            <Text className="text-[13px] font-bold text-slate-900">Choose a doctor to review your case</Text>
            <Pressable
              disabled={busy}
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose a doctor"
              className={`flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-3 ${busy ? "opacity-50" : ""}`}
            >
              <Text className={`mr-2 flex-1 text-sm ${picked ? "text-slate-900" : "text-slate-500"}`}>
                {picked ? doctorLabel(picked) : "\u2014 Pick a doctor \u2014"}
              </Text>
              <ChevronDown size={16} color="#64748b" />
            </Pressable>
            <Button onPress={requestReview} disabled={busy || !pickedId}>
              {busy ? "Sending request\u2026" : "Request second opinion"}
            </Button>
          </View>
        )}

        {err && (
          <View className="rounded-lg bg-red-50 px-3 py-2.5">
            <Text className="text-xs font-medium text-red-700">{err}</Text>
          </View>
        )}
        {success && (
          <View className="rounded-lg bg-emerald-50 px-3 py-2.5">
            <Text className="text-xs font-medium text-emerald-800">{success}</Text>
          </View>
        )}

        {pendingReviews.length > 0 && (
          <View className="gap-1.5">
            <Text className="text-sm font-bold text-slate-900">Waiting for review</Text>
            {pendingReviews.map((r) => {
              const doc = doctors.find((d) => d.id === r.reviewer_id);
              return (
                <View key={r.id} className="rounded-lg bg-amber-50 px-3 py-2.5">
                  <Text className="text-xs leading-4 text-amber-900">
                    {`\u23F3 Awaiting reply from ${doc ? doc.full_name : `doctor #${r.reviewer_id}`}`}
                    {doc?.specialty ? ` (${doc.specialty})` : ""}
                    {` \u2014 requested ${new Date(r.created_at).toLocaleString()}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {completedReviews.length > 0 && (
          <View className="gap-2">
            <Text className="text-sm font-bold text-slate-900">Second opinions received</Text>
            {completedReviews.map((r) => {
              const doc = doctors.find((d) => d.id === r.reviewer_id);
              const tone = verdictTone(r.verdict);
              return (
                <View key={r.id} className={`gap-1 rounded-lg px-3 py-2.5 ${tone.box}`}>
                  <Text className={`text-[13px] ${tone.text}`}>
                    <Text className="font-bold">{doc ? doc.full_name : `Doctor #${r.reviewer_id}`}</Text>
                    {doc?.specialty ? ` (${doc.specialty})` : ""}
                  </Text>
                  <Text className={`text-[13px] ${tone.text}`}>
                    {(r.verdict && VERDICT_LABEL[r.verdict]) || r.verdict}
                  </Text>
                  {r.comments ? (
                    <Text className={`mt-1 text-[13px] italic ${tone.text}`}>{`\u201C${r.comments}\u201D`}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </CardContent>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPickerOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-2xl bg-white pb-6 pt-2">
            <View className="mb-1 items-center py-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>
            <FlatList
              data={availableDoctors}
              keyExtractor={(d) => String(d.id)}
              renderItem={({ item: d }) => (
                <Pressable
                  onPress={() => {
                    setPickedId(String(d.id));
                    setPickerOpen(false);
                  }}
                  className="flex-row items-center justify-between px-5 py-3.5"
                >
                  <View className="mr-3 flex-1">
                    <Text className="text-sm font-medium text-slate-900">{d.full_name}</Text>
                    {(d.specialty || d.clinic) && (
                      <Text className="text-xs text-slate-500">
                        {[d.specialty, d.clinic].filter(Boolean).join(" \u00b7 ")}
                      </Text>
                    )}
                  </View>
                  {String(d.id) === pickedId && <Check size={16} color="#4ab96a" />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
