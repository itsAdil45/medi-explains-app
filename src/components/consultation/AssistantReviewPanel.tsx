import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Send, Undo2, UserCheck } from "lucide-react-native";

import { api } from "@/api/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";

const SENDABLE = ["drafted", "safety_review_required", "assistant_reviewed"];
const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  strength: "Strength",
  dose: "Dose",
  dose_unit: "Dose unit",
  dosage_form: "Form",
  route: "Route",
  frequency: "Frequency",
  timing: "Timing",
  food_instruction: "Food",
  duration: "Duration",
  as_needed: "As needed",
  indication: "For",
  notes: "Notes",
};
const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

// What the assistant changed in one review round.
export function ReviewChanges({ changes }: { changes?: any[] }) {
  if (!changes?.length)
    return <Text className="text-xs text-slate-500">No medication changes.</Text>;
  return (
    <View className="gap-1.5">
      {changes.map((ch, i) => (
        <View key={i} className="rounded-md bg-slate-50 px-3 py-2">
          <Text className="text-[13px] text-slate-700">
            <Text className="font-semibold text-slate-900">
              {ch.name || `Medication ${ch.index + 1}`}
            </Text>
            {ch.action === "added" && " · added"}
            {ch.action === "removed" && " · removed"}
            {ch.action === "updated" && (
              <>
                {" · "}
                {Object.keys(ch.after || {}).map((k, j) => (
                  <Text key={k}>
                    {j > 0 && "; "}
                    {FIELD_LABEL[k] || k}:{" "}
                    <Text className="text-slate-400 line-through">
                      {show(ch.before?.[k])}
                    </Text>
                    {" → "}
                    <Text className="font-bold">{show(ch.after[k])}</Text>
                  </Text>
                ))}
              </>
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Treating doctor's side of the assistant round trip: send, recall, and
// read what came back.
export default function AssistantReviewPanel({
  c,
  setC,
  transcriptStale,
  requiresReview,
}: {
  c: any;
  setC: (c: any) => void;
  transcriptStale: boolean;
  requiresReview: boolean;
}) {
  const [rounds, setRounds] = useState<any[]>([]);
  const [assistants, setAssistants] = useState<any[]>([]);
  const [assistantId, setAssistantId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .reviewsForConsultation(c.id)
      .then(setRounds)
      .catch(() => {});
  }, [c.id, c.status]);

  useEffect(() => {
    api
      .listAssistants(c.doctor_id)
      .then((list: any[]) => {
        const active = list.filter((a) => a.is_active);
        setAssistants(active);
        if (active.length === 1) setAssistantId(String(active[0].id));
      })
      .catch(() => {});
  }, [c.doctor_id]);

  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setC(await api.getConsultation(c.id));
      setNote("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const pending = rounds.find((r) => r.status === "pending");
  const lastReturned = rounds.find((r) => r.status === "returned");
  const canSend = SENDABLE.includes(c.status) && !transcriptStale;

  if (!pending && !lastReturned && !canSend) return null;

  const sendLabel = lastReturned
    ? "Send back for another look"
    : `Send to ${assistants.length === 1 ? assistants[0].full_name : "assistant"}`;

  return (
    <Card className={`mb-5 ${pending ? "border-violet-200 bg-violet-50/40" : ""}`}>
      <CardHeader>
        <View className="flex-row items-center gap-1.5">
          <UserCheck size={16} color="#0f172a" />
          <CardTitle>Assistant review</CardTitle>
        </View>
        {pending && (
          <CardDescription>
            With{" "}
            <Text className="font-bold text-slate-700">
              {pending.assistant_name}
            </Text>{" "}
            since {new Date(pending.sent_at).toLocaleString()}. Editing is
            paused until it comes back - recall it if you need to change
            something now.
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="gap-4">
        {pending && (
          <View className="gap-3">
            <Text className="text-[13px] text-slate-700">
              {pending.doctor_note
                ? `Your note: “${pending.doctor_note}”`
                : "No note sent."}
              {pending.changes.length > 0 &&
                ` · ${pending.changes.length} change(s) so far`}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              className="self-start"
              onPress={() => act(() => api.recallFromAssistant(c.id))}
            >
              <View className="flex-row items-center gap-1.5">
                <Undo2 size={14} color="#334155" />
                <Text className="text-sm font-semibold text-slate-700">
                  Recall
                </Text>
              </View>
            </Button>
          </View>
        )}

        {!pending && lastReturned && (
          <View className="gap-2.5">
            <View className="rounded-lg bg-emerald-50 px-3.5 py-2.5">
              <Text className="text-[13px] text-emerald-900">
                Reviewed by{" "}
                <Text className="font-bold">{lastReturned.assistant_name}</Text>{" "}
                on {new Date(lastReturned.returned_at).toLocaleString()}.
              </Text>
              {lastReturned.assistant_notes && (
                <Text className="mt-1 text-[13px] text-emerald-900">
                  {`“${lastReturned.assistant_notes}”`}
                </Text>
              )}
            </View>
            <ReviewChanges changes={lastReturned.changes} />
            {lastReturned.changes.some((ch: any) => ch.action !== "removed") && (
              <Text className="text-xs text-slate-500">
                Changed medicines need your confirmation again in the
                Medications tab before you approve.
              </Text>
            )}
          </View>
        )}

        {!pending &&
          canSend &&
          (assistants.length === 0 ? (
            <Text className="text-[13px] text-slate-600">
              {requiresReview
                ? "Your approval needs an assistant review, but you have no assistant yet. "
                : ""}
              <Text
                onPress={() => router.push("/profile")}
                className="font-semibold text-[#792884] underline"
              >
                Add an assistant in your profile
              </Text>{" "}
              to have prescriptions checked before you approve them.
            </Text>
          ) : (
            <View className="gap-2.5">
              {assistants.length > 1 && (
                <SelectField
                  className=""
                  value={assistantId}
                  placeholder={"Choose assistant…"}
                  options={assistants.map((a) => ({
                    id: a.id,
                    label: a.full_name,
                  }))}
                  onChange={setAssistantId}
                />
              )}
              <Input
                accessibilityLabel="Note for the assistant"
                value={note}
                onChangeText={setNote}
                placeholder="Note for the assistant (optional), e.g. check paediatric dose"
                className="h-11 bg-slate-50"
              />
              <Button
                variant={lastReturned ? "secondary" : "default"}
                disabled={busy || (assistants.length > 1 && !assistantId)}
                loading={busy}
                onPress={() =>
                  act(() =>
                    api.sendToAssistant(c.id, {
                      assistant_id: assistantId ? Number(assistantId) : null,
                      note: note.trim() || null,
                    }),
                  )
                }
              >
                <View className="flex-row items-center gap-1.5">
                  <Send size={14} color={lastReturned ? "#334155" : "#fff"} />
                  <Text
                    className={`text-sm font-semibold ${lastReturned ? "text-slate-700" : "text-white"}`}
                  >
                    {sendLabel}
                  </Text>
                </View>
              </Button>
            </View>
          ))}

        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
      </CardContent>
    </Card>
  );
}
