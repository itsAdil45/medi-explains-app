import { useEffect, useRef } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
} from "expo-audio";

// expo-audio's recorder state updates on its own polling interval (no manual
// setInterval/timer bookkeeping needed like the web version's elapsed-time
// timer and Web Audio analyser). metering is in dB (roughly -160..0); this
// maps it to the same rough 0-100 "mic level" the original UI showed.
function levelFromMetering(db: number | undefined) {
  if (db == null) return 0;
  return Math.max(0, Math.min(100, Math.round(100 + db)));
}

export default function Recorder({
  onComplete,
  disabled,
  maxMinutes = 90,
}: {
  onComplete: (file: { uri: string; name: string; type: string }) => void;
  disabled?: boolean;
  maxMinutes?: number;
}) {
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const state = useAudioRecorderState(audioRecorder, 250);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
      if (audioRecorder.isRecording) audioRecorder.stop().catch(() => {});
    };
  }, []);

  async function start() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone access needed", "Enable microphone access to record the consultation.");
        return;
      }
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      maxTimerRef.current = setTimeout(() => stop(), maxMinutes * 60 * 1000);
    } catch (err: any) {
      Alert.alert("Microphone unavailable", err.message);
    }
  }

  function pause() {
    if (state.isRecording) audioRecorder.pause();
  }

  function resume() {
    if (!state.isRecording && audioRecorder.uri) audioRecorder.record();
  }

  async function stop() {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    try {
      await audioRecorder.stop();
      if (audioRecorder.uri) {
        onComplete({ uri: audioRecorder.uri, name: "consultation.m4a", type: "audio/m4a" });
      }
    } catch (err: any) {
      Alert.alert("Recording error", err.message);
    }
  }

  const recording = state.isRecording;
  // expo-audio has no separate "paused" flag - a recorder that has a uri
  // (i.e. has started) but isn't currently recording is paused, until stop()
  // is explicitly called.
  const paused = !recording && !!audioRecorder.uri && state.durationMillis > 0;
  const elapsed = Math.floor((state.durationMillis || 0) / 1000);
  const level = levelFromMetering(state.metering);

  return (
    <View className="items-center px-6 py-6">
      {!recording && !paused ? (
        <Pressable
          disabled={disabled}
          onPress={start}
          className={`size-16 items-center justify-center rounded-full bg-red-600 ${disabled ? "opacity-50" : ""}`}
        >
          <Text className="text-xs font-bold text-white">REC</Text>
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3">
          <Pressable onPress={stop} className="size-16 items-center justify-center rounded-full bg-red-600">
            <Text className="text-xs font-bold text-white">STOP</Text>
          </Pressable>
          {recording ? (
            <Pressable onPress={pause} className="rounded-lg border border-slate-200 px-4 py-2.5">
              <Text className="text-sm font-semibold text-slate-700">Pause</Text>
            </Pressable>
          ) : (
            <Pressable onPress={resume} className="rounded-lg border border-slate-200 px-4 py-2.5">
              <Text className="text-sm font-semibold text-slate-700">Resume</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text className="mt-3 text-xs text-slate-500">
        {!recording && !paused
          ? "Tap to start recording (mic permission required)"
          : `${paused ? "Paused" : "Recording"} \u00b7 ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} \u00b7 mic level ${level}`}
      </Text>
    </View>
  );
}
