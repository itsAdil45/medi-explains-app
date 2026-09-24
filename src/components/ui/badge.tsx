import { View, Text } from "react-native";

export type BadgeTone = "slate" | "green" | "amber" | "violet" | "red" | "sky";

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string }> = {
  slate: { bg: "bg-slate-100", text: "text-slate-600" },
  green: { bg: "bg-emerald-100", text: "text-emerald-700" },
  amber: { bg: "bg-amber-100", text: "text-amber-800" },
  violet: { bg: "bg-violet-100", text: "text-violet-700" },
  red: { bg: "bg-red-100", text: "text-red-700" },
  sky: { bg: "bg-sky-100", text: "text-sky-700" },
};

export function Badge({
  tone = "slate",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  const t = TONE_STYLES[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 ${t.bg} ${className}`}>
      <Text className={`text-[11px] font-semibold ${t.text}`}>{children}</Text>
    </View>
  );
}

// Not given to us from the website (StatusBadge's own source wasn't
// shared), so this infers a reasonable label/tone from every status value
// that actually appears across Dashboard.jsx/ConsultationView.jsx/
// PipelineStepper.jsx - matches their NEEDS_ATTENTION/RELEASED/PROCESSING
// groupings where a status shows up in more than one.
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  recording: { label: "Recording", tone: "sky" },
  transcribing: { label: "Transcribing", tone: "sky" },
  transcribed: { label: "Transcribed", tone: "sky" },
  transcript_review: { label: "Transcript review", tone: "sky" },
  summarising: { label: "Summarising", tone: "sky" },
  safety_check: { label: "Safety check", tone: "sky" },
  translating: { label: "Translating", tone: "sky" },
  drafted: { label: "Drafted", tone: "amber" },
  safety_review_required: { label: "Needs safety review", tone: "amber" },
  approved: { label: "Approved", tone: "violet" },
  released: { label: "Released", tone: "green" },
  under_cross_check: { label: "Under cross-check", tone: "green" },
  cross_checked: { label: "Cross-checked", tone: "green" },
  processing_failed: { label: "Processing failed", tone: "red" },
  rejected: { label: "Rejected", tone: "red" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || {
    label: status.replaceAll("_", " "),
    tone: "slate" as BadgeTone,
  };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
