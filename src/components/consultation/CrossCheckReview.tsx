import { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import SafetyChecks from "@/components/SafetyChecks";

const VERDICTS = [
  { value: "agree", label: "Agree" },
  { value: "partially_agree", label: "Partially agree" },
  { value: "disagree", label: "Disagree" },
  { value: "suggest_followup", label: "Suggest follow-up" },
  { value: "flag", label: "Flag concern" },
];

export default function CrossCheckReview({ consultation }: { consultation: any }) {
  const [verdict, setVerdict] = useState("agree");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comments, setComments] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    try {
      const pending = await api.pendingCrossChecks();
      const mine = pending.find((x: any) => x.consultation_id === consultation.id);
      if (!mine) throw new Error("No active review is assigned to you for this case");
      await api.submitCrossCheck(mine.id, { verdict, comments });
      setDone(true);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (done) {
    return (
      <View className="rounded-lg bg-emerald-50 px-4 py-3">
        <Text className="text-sm font-medium text-emerald-800">Review submitted.</Text>
      </View>
    );
  }

  const verdictLabel = VERDICTS.find((v) => v.value === verdict)?.label;

  return (
    <View className="gap-5">
      <View className="rounded-lg bg-sky-50 px-4 py-3">
        <Text className="text-[13px] text-sky-900">
          You can view this case because it was explicitly assigned to you. Your review does not overwrite the
          treating doctor's decision.
        </Text>
      </View>

      <Card>
        <CardHeader>
          <CardTitle>Source transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <TextInput
            editable={false}
            value={consultation.verified_transcript || consultation.raw_transcript || ""}
            multiline
            className="min-h-[160px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctor-approved patient summary</CardTitle>
        </CardHeader>
        <CardContent>
          <TextInput
            editable={false}
            value={consultation.doctor_edited_summary || consultation.patient_summary_en || ""}
            multiline
            className="min-h-[140px] rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI safety checks</CardTitle>
        </CardHeader>
        <CardContent>
          <SafetyChecks consultationId={consultation.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit your review</CardTitle>
        </CardHeader>
        <CardContent className="gap-3.5">
          <View>
            <Text className="mb-1.5 text-xs font-semibold text-slate-700">Your verdict</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              className="flex-row items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
            >
              <Text className="text-sm text-slate-900">{verdictLabel}</Text>
              <ChevronDown size={16} color="#64748b" />
            </Pressable>
          </View>
          <View>
            <Text className="mb-1.5 text-xs font-semibold text-slate-700">Clinical comments</Text>
            <TextInput
              value={comments}
              onChangeText={setComments}
              multiline
              className="min-h-[100px] rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"
            />
          </View>
          {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
          <Button onPress={submit}>Submit review</Button>
        </CardContent>
      </Card>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPickerOpen(false)}>
          <Pressable className="rounded-t-2xl bg-white pb-6 pt-2">
            <View className="mb-1 items-center py-2">
              <View className="h-1 w-10 rounded-full bg-slate-300" />
            </View>
            <FlatList
              data={VERDICTS}
              keyExtractor={(v) => v.value}
              renderItem={({ item: v }) => (
                <Pressable
                  onPress={() => {
                    setVerdict(v.value);
                    setPickerOpen(false);
                  }}
                  className="flex-row items-center justify-between px-5 py-3.5"
                >
                  <Text className="text-sm font-medium text-slate-900">{v.label}</Text>
                  {v.value === verdict && <Check size={16} color="#4ab96a" />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
