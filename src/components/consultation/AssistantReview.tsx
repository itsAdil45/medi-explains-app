import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Plus, SendHorizontal, ShieldCheck } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import MedicationEditor from "@/components/MedicationEditor";
import SafetyChecks from "@/components/SafetyChecks";
import { ReviewChanges } from "./AssistantReviewPanel";

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="mb-1.5 text-[13px] font-bold text-slate-900">
        {label}
      </Text>
      <View className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
        <Text selectable className="text-sm text-slate-800">
          {value}
        </Text>
      </View>
    </View>
  );
}

// The assistant's side: check the drafted prescription against what was
// said, correct it, hand it back with notes. Confirming and approving stay
// with the doctor.
export default function AssistantReview({
  c,
  setC,
  meds,
  busy,
  addMed,
}: {
  c: any;
  setC: (c: any) => void;
  meds: any[];
  busy: boolean;
  addMed: () => void;
}) {
  const { user } = useAuth();
  const [rounds, setRounds] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .reviewsForConsultation(c.id)
      .then(setRounds)
      .catch((e: any) => setErr(e.message));
    // structured_data changes on every medication edit - keeps "Your
    // changes" current.
  }, [c.id, c.status, c.structured_data]);

  const current = rounds.find(
    (r) => r.status === "pending" && r.assistant_id === user?.id,
  );
  const latest = rounds[0];
  const shown = current || latest;
  const editable = !!current && c.status === "assistant_review";

  async function returnToDoctor() {
    setSending(true);
    setErr(null);
    try {
      await api.returnToDoctor(c.id, notes.trim() || null);
      setC(await api.getConsultation(c.id));
      setNotes("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  const englishTranscript = c.model_metadata?.doctor_transcript_en || "";

  return (
    <View className="gap-5">
      <Card className={editable ? "border-violet-200 bg-violet-50/40" : ""}>
        <CardHeader>
          <CardTitle>
            {editable ? "Waiting for your review" : "Prescription review"}
          </CardTitle>
          <CardDescription>
            {editable
              ? "Check each medicine against the consultation, correct anything wrong, then send it back. The doctor confirms every change and gives the final approval."
              : latest?.status === "returned"
                ? `You sent this back on ${new Date(latest.returned_at).toLocaleString()}.`
                : latest?.status === "recalled"
                  ? "The doctor took this back before your review was finished."
                  : "Not currently with you."}
          </CardDescription>
        </CardHeader>
        {Boolean(current?.doctor_note || (!editable && latest)) && (
          <CardContent className="gap-2.5">
            {Boolean(shown?.doctor_note) && (
              <View className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                <Text className="text-[13px] text-slate-700">
                  {`Doctor's note: “${shown.doctor_note}”`}
                </Text>
              </View>
            )}
            {!editable && Boolean(latest?.assistant_notes) && (
              <Text className="text-[13px] text-slate-700">
                {`Your notes: “${latest.assistant_notes}”`}
              </Text>
            )}
            {!editable && latest && <ReviewChanges changes={latest.changes} />}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medications</CardTitle>
          <CardDescription>
            Anything you change is marked for the doctor to re-confirm.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-2.5">
          {!meds.length && (
            <Text className="text-xs text-slate-500">
              No medications were extracted.
            </Text>
          )}
          {meds.map((m, i) => (
            <MedicationEditor
              key={`${i}-${m.name || ""}`}
              consultationId={c.id}
              index={i}
              med={m}
              readOnly={!editable}
              canConfirm={false}
              onChange={setC}
            />
          ))}
          {editable && (
            <Button
              variant="secondary"
              size="sm"
              onPress={addMed}
              disabled={busy}
              className="self-start"
            >
              <View className="flex-row items-center gap-1.5">
                <Plus size={14} color="#334155" />
                <Text className="text-sm font-semibold text-slate-700">
                  Add a missing medication
                </Text>
              </View>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-1.5">
            <ShieldCheck size={16} color="#0f172a" />
            <CardTitle>Automated safety checks</CardTitle>
          </View>
          <CardDescription>
            For reference - the doctor resolves these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SafetyChecks consultationId={c.id} canResolve={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What was said</CardTitle>
          <CardDescription>
            The consultation the prescription was drafted from.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          {Boolean(englishTranscript) && (
            <ReadOnlyText
              label="Transcript — English"
              value={englishTranscript}
            />
          )}
          <ReadOnlyText
            label="Original transcript"
            value={c.raw_transcript || ""}
          />
          {Boolean(c.clinical_note) && (
            <ReadOnlyText label="Clinical note" value={c.clinical_note} />
          )}
        </CardContent>
      </Card>

      {editable && (
        <View className="gap-3 border-t border-slate-200 pt-5">
          <Text className="text-[13px] font-bold text-slate-900">
            Notes for the doctor
          </Text>
          <Input
            accessibilityLabel="Notes for the doctor"
            value={notes}
            onChangeText={setNotes}
            placeholder="What you checked, what you changed and why"
            multiline
            textAlignVertical="top"
            className="min-h-[90px] bg-white"
          />
          {(current?.changes?.length ?? 0) > 0 && (
            <View>
              <Text className="mb-1.5 text-xs font-semibold text-slate-600">
                Your changes
              </Text>
              <ReviewChanges changes={current.changes} />
            </View>
          )}
          {err && (
            <Text className="text-xs font-medium text-red-600">{err}</Text>
          )}
          <Button disabled={sending} loading={sending} onPress={returnToDoctor}>
            <View className="flex-row items-center gap-1.5">
              <SendHorizontal size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">
                {sending ? "Sending…" : "Send back to the doctor"}
              </Text>
            </View>
          </Button>
        </View>
      )}
    </View>
  );
}
