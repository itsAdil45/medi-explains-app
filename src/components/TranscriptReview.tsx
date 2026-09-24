import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { api } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Segment = {
  id: string;
  start_seconds: number;
  end_seconds: number;
  language?: string;
  confidence?: number;
  needs_review: boolean;
  text_raw: string;
  text_reviewed?: string;
  speaker_label?: string;
};

export default function TranscriptReview({
  consultationId,
  readOnly = false,
  onChanged,
}: {
  consultationId: string;
  readOnly?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setSegments(await api.transcriptSegments(consultationId));
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [consultationId]);

  async function save(seg: Segment, text: string, speaker: string) {
    setBusy(seg.id);
    setErr(null);
    try {
      const updated = await api.updateTranscriptSegment(consultationId, seg.id, {
        // Sending the text even when unchanged is deliberate. It records
        // explicit clinician acceptance of the low-confidence speech.
        text_reviewed: text,
        speaker_label: speaker,
        needs_review: false,
      });
      setSegments((xs) => xs.map((x) => (x.id === seg.id ? updated : x)));
      await onChanged?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (err) return <Text className="text-xs font-medium text-red-600">{err}</Text>;

  if (!segments.length) {
    return (
      <Text className="text-xs text-slate-500">
        Segment-level transcript is not available for this older consultation.
      </Text>
    );
  }

  return (
    <View>
      <Text className="mb-2 text-xs text-slate-500">
        Low-confidence speech is highlighted. Listen to each highlighted segment and either correct
        it or explicitly confirm that the transcription is accurate. Raw STT text is always
        preserved.
      </Text>

      {segments.map((seg) => (
        <Segment key={seg.id} seg={seg} readOnly={readOnly} busy={busy === seg.id} onSave={save} />
      ))}
    </View>
  );
}

function Segment({
  seg,
  readOnly,
  busy,
  onSave,
}: {
  seg: Segment;
  readOnly: boolean;
  busy: boolean;
  onSave: (seg: Segment, text: string, speaker: string) => void;
}) {
  const [text, setText] = useState(seg.text_reviewed ?? seg.text_raw);
  const [speaker, setSpeaker] = useState(seg.speaker_label ?? "");

  const low = seg.needs_review;
  const textChanged = text !== (seg.text_reviewed ?? seg.text_raw);
  const speakerChanged = speaker !== (seg.speaker_label ?? "");
  const changed = textChanged || speakerChanged;

  return (
    <View className={`mb-2 rounded-lg p-3 ${low ? "bg-red-50" : "bg-transparent"}`}>
      <View className="flex-row flex-wrap items-center gap-2.5">
        <Text className="text-xs font-bold text-slate-900">
          {seg.start_seconds.toFixed(1)}{"\u2013"}{seg.end_seconds.toFixed(1)}s
        </Text>
        {seg.language && <Badge tone="slate">{seg.language.toUpperCase()}</Badge>}
        {seg.confidence != null && (
          <Text className="text-xs text-slate-500">STT confidence {Math.round(seg.confidence * 100)}%</Text>
        )}
        {low && <Text className="text-xs font-bold text-red-700">{"\u26a0"} Clinician review required</Text>}
        {!low && seg.text_reviewed && <Badge tone="green">Reviewed</Badge>}
      </View>

      <View className="mt-1.5 gap-1.5">
        <TextInput
          value={speaker}
          onChangeText={setSpeaker}
          editable={!readOnly}
          placeholder="Speaker (Doctor / Patient)"
          placeholderTextColor="#94a3b8"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
        />
        <TextInput
          value={text}
          onChangeText={setText}
          editable={!readOnly}
          multiline
          className="min-h-[60px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </View>

      {!readOnly && (low || changed) && (
        <Pressable
          disabled={busy || !text.trim()}
          onPress={() => onSave(seg, text, speaker)}
          className={`mt-2 items-center rounded-lg border border-slate-200 py-2 ${busy || !text.trim() ? "opacity-50" : ""}`}
        >
          <Text className="text-xs font-semibold text-slate-700">
            {busy
              ? "Saving\u2026"
              : low && !textChanged
                ? "I listened and confirm this transcript is accurate"
                : low
                  ? "Save correction and mark reviewed"
                  : "Save reviewed segment"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
