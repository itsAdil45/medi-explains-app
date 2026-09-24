import { View, Text } from "react-native";
import { Check, AlertTriangle } from "lucide-react-native";

const STAGES = [
  { key: "recorded", label: "Recorded" },
  { key: "transcribed", label: "Transcribed" },
  { key: "safety", label: "Safety review" },
  { key: "approved", label: "Approved" },
  { key: "released", label: "Released" },
];

// Maps a backend ConsultationStatus to how many of the 5 stages are fully
// DONE. The stage at this index (if < 5) is the current/active one;
// released/cross_checked are terminal states where all 5 are done.
const STATUS_COMPLETED: Record<string, number> = {
  recording: 0,
  transcribing: 1,
  transcribed: 2,
  transcript_review: 2,
  summarising: 2,
  safety_check: 2,
  drafted: 2,
  safety_review_required: 2,
  approved: 3,
  translating: 4,
  released: 5,
  under_cross_check: 5,
  cross_checked: 5,
};

export default function PipelineStepper({ status }: { status: string }) {
  const failed = status === "processing_failed" || status === "rejected";
  const activeIndex = STATUS_COMPLETED[status] ?? 0;

  return (
    <View className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-5">
      <View className="flex-row items-center">
        {STAGES.map((stage, i) => {
          const isLast = i === STAGES.length - 1;
          const done = !failed && i < activeIndex;
          const current = !failed && i === activeIndex;
          const erroredHere = failed && i === activeIndex;

          return (
            <View key={stage.key} className={`flex-row items-center ${isLast ? "" : "flex-1"}`}>
              <View className="items-center gap-1.5">
                <View
                  className={`size-[28px] items-center justify-center rounded-full ${
                    erroredHere
                      ? "bg-red-600"
                      : done
                        ? "bg-emerald-500"
                        : current
                          ? "bg-amber-500"
                          : "bg-slate-200"
                  }`}
                >
                  {erroredHere ? (
                    <AlertTriangle size={13} color="#fff" strokeWidth={2.5} />
                  ) : done ? (
                    <Check size={13} color="#fff" strokeWidth={2.5} />
                  ) : (
                    <View className={`size-2 rounded-full ${current ? "bg-white" : "bg-slate-400"}`} />
                  )}
                </View>
                <Text
                  className={`text-[10.5px] ${
                    erroredHere
                      ? "font-bold text-red-600"
                      : current
                        ? "font-bold text-slate-900"
                        : done
                          ? "font-semibold text-slate-700"
                          : "font-medium text-slate-400"
                  }`}
                >
                  {stage.label}
                </Text>
              </View>
              {!isLast && (
                <View
                  className={`mx-1.5 mb-[20px] h-0.5 flex-1 ${
                    done || (failed && i < activeIndex) ? "bg-emerald-500" : "bg-slate-200"
                  }`}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
