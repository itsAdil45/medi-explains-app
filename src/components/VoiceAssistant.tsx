import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { createAudioPlayer, useAudioRecorder, AudioModule, RecordingPresets, type AudioPlayer } from "expo-audio";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Mic, Square, X } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { useAccessibility } from "@/context/AccessibilityContext";
import { downloadAuthedFile } from "@/api/download";

// Forgiving on purpose - a blind/low-vision patient shouldn't need to hit one
// exact phrase.
const WAKE_PHRASES = ["hey doctor", "hey doc", "ok doctor", "okay doctor", "hello doctor", "hey assistant"];

function containsWakePhrase(text: string) {
  const t = (text || "").toLowerCase();
  return WAKE_PHRASES.some((p) => t.includes(p));
}

// Single tap starts a fixed-length recording and auto-stops - no second tap
// required to end it, which is the more reliable interaction for a
// screen-reader/low-vision user who may not easily re-find the button in
// time. This window only starts *after* the "Listening..." prompt has
// finished speaking (see speakAndWait), so the full duration is available
// for the patient's actual question.
const RECORD_MS = 10000;

const AS_COLLAPSED = "mxp_voice_widget_collapsed";

// Maps a matched voice_query.py intent to which audio endpoint answers it and
// a human label for the status text. Keep in sync with the backend's
// voice_query.py _INTENT_KEYWORDS keys.
const INTENT_CONFIG: Record<string, { url: (api: any, id: string) => string; label: string }> = {
  prescription: { url: (api, id) => api.prescriptionAudioUrl(id), label: "your prescription" },
  advice: { url: (api, id) => api.adviceAudioUrl(id), label: "the doctor's advice" },
  symptoms: { url: (api, id) => api.symptomsAudioUrl(id), label: "your symptoms and diagnosis" },
  summary: { url: (api, id) => api.audioSummaryUrl(id), label: "your visit summary" },
};

// Short spoken UI prompts ("Listening...", not the prescription itself) use
// expo-speech - instant, no server round-trip. The prescription content
// itself is always the higher-quality voice served from the backend.
function speak(text: string) {
  try {
    Speech.stop();
    Speech.speak(text);
  } catch {}
}

// Same as speak(), but resolves once the utterance actually finishes (with a
// timeout fallback). Used so recording only starts once the "Listening..."
// prompt is fully spoken.
function speakAndWait(text: string, maxWaitMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      Speech.stop();
      Speech.speak(text, { onDone: finish, onError: finish, onStopped: finish });
    } catch {
      finish();
      return;
    }
    setTimeout(finish, maxWaitMs);
  });
}

type Phase = "idle" | "preparing" | "listening" | "processing" | "speaking" | "error";

export default function VoiceAssistant() {
  const { user } = useAuth();
  const isPatient = user?.role === "patient";
  const { voiceWakeEnabled, setVoiceWakeEnabled, voiceWakeForced } = useAccessibility();
  const insets = useSafeAreaInsets();

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(AS_COLLAPSED).then((v) => {
      if (v != null) setCollapsed(v === "true");
    });
  }, []);
  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    AsyncStorage.setItem(AS_COLLAPSED, String(v)).catch(() => {});
  }

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [speakingLabel, setSpeakingLabel] = useState("");
  // Whether the wake-word recognizer is actually running right now - distinct
  // from voiceWakeEnabled (the patient's saved preference), since it's
  // deliberately paused while a question is being captured/answered.
  const [wakeListening, setWakeListening] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const answerPlayerRef = useRef<AudioPlayer | null>(null);
  const beepPlayerRef = useRef<AudioPlayer | null>(null);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeActiveRef = useRef(false);

  // Long-lived event handlers (useSpeechRecognitionEvent below) close over
  // stale state otherwise - these mirror the latest values.
  const phaseRef = useRef(phase);
  const wakeEnabledRef = useRef(voiceWakeEnabled);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    wakeEnabledRef.current = voiceWakeEnabled;
  }, [voiceWakeEnabled]);

  function getBeepPlayer() {
    if (!beepPlayerRef.current) beepPlayerRef.current = createAudioPlayer(require("@/assets/sounds/beep.wav"));
    return beepPlayerRef.current;
  }

  async function playBeep() {
    try {
      const player = getBeepPlayer();
      await player.seekTo(0);
      player.play();
    } catch {}
  }

  // =======================================================
  // ASK / RECORD
  // =======================================================

  async function startListening() {
    if (phase !== "idle" && phase !== "error") return;
    setMessage(null);
    setTranscript(null);

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error("no-permission");

      // Speak the prompt to completion BEFORE recording starts, so the full
      // RECORD_MS window is available for the patient's actual question
      // instead of partly consumed by the prompt itself.
      setPhase("preparing");
      await speakAndWait("Ask your question after the beep. Tap again to stop.", 4000);

      await audioRecorder.prepareToRecordAsync();
      await playBeep();
      audioRecorder.record();
      setPhase("listening");

      // Safety net for anyone who doesn't tap to stop - finishRecording()
      // below is the normal path once someone finishes speaking early.
      recordTimeoutRef.current = setTimeout(finishRecording, RECORD_MS);
    } catch {
      setPhase("error");
      setMessage("Microphone access is required to ask a question.");
      speak("Microphone access is required to ask a question.");
    }
  }

  // Tapping the mic again while listening ends the recording immediately,
  // instead of making the patient wait out the rest of the fixed window.
  function stopListening() {
    finishRecording();
  }

  async function finishRecording() {
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
    if (!audioRecorder.isRecording) return;
    try {
      await audioRecorder.stop();
    } catch {}
    const uri = audioRecorder.uri;
    if (uri) {
      handleRecording({ uri, name: "question.m4a", type: "audio/m4a" });
    } else {
      setPhase("idle");
    }
  }

  // Interrupts the spoken answer mid-playback.
  function stopSpeaking() {
    try {
      answerPlayerRef.current?.pause();
    } catch {}
    Speech.stop();
    setPhase("idle");
  }

  function handleMicClick() {
    if (phase === "listening") stopListening();
    else if (phase === "speaking") stopSpeaking();
    else startListening();
  }

  // =======================================================
  // WAKE PHRASE
  // =======================================================

  async function startWakeListening() {
    if (wakeActiveRef.current) return;
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return;
    try {
      wakeActiveRef.current = true;
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: false, continuous: true });
    } catch {
      wakeActiveRef.current = false;
    }
  }

  function stopWakeListening() {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (wakeActiveRef.current) {
      wakeActiveRef.current = false;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    }
    setWakeListening(false);
  }

  useSpeechRecognitionEvent("start", () => {
    if (wakeActiveRef.current) setWakeListening(true);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!wakeActiveRef.current) return;
    const text = event.results?.[0]?.transcript || "";
    if (containsWakePhrase(text)) {
      stopWakeListening();
      startListening();
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!wakeActiveRef.current) return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      // Mic access was denied or revoked - stop trying and turn the
      // preference off, rather than silently failing forever.
      wakeEnabledRef.current = false;
      setVoiceWakeEnabled(false);
      wakeActiveRef.current = false;
      setPhase("error");
      setMessage(
        "Microphone access was denied, so hands-free listening was turned off. You can still tap the microphone to ask a question.",
      );
    }
    // 'no-speech' and 'aborted' fire constantly and routinely in continuous
    // mode during ordinary silence - not real errors.
  });

  useSpeechRecognitionEvent("end", () => {
    setWakeListening(false);
    if (!wakeActiveRef.current) return;
    wakeActiveRef.current = false;
    // Continuous mode still ends on its own periodically (silence timeouts,
    // OS quirks) - restart automatically unless the patient turned it off or
    // a question is actively in flight.
    if (wakeEnabledRef.current && (phaseRef.current === "idle" || phaseRef.current === "error")) {
      restartTimerRef.current = setTimeout(startWakeListening, 300);
    }
  });

  function toggleWake() {
    const next = !voiceWakeEnabled;
    setVoiceWakeEnabled(next);
    if (next) {
      setMessage(null);
      speak("Hands-free mode on. Say Hey Doctor anytime to ask a question.");
      startWakeListening();
    } else {
      stopWakeListening();
    }
  }

  // Resume wake listening once back at idle/error (an answer finished
  // playing, was interrupted, or a question wasn't understood).
  useEffect(() => {
    if (voiceWakeEnabled && !wakeActiveRef.current && (phase === "idle" || phase === "error")) {
      startWakeListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voiceWakeEnabled]);

  // Best-effort auto-resume on mount if this was already enabled in a
  // previous session.
  useEffect(() => {
    if (voiceWakeEnabled) startWakeListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      stopWakeListening();
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
      try {
        answerPlayerRef.current?.remove();
      } catch {}
      try {
        beepPlayerRef.current?.remove();
      } catch {}
    },
    [],
  );

  // =======================================================
  // ANSWER
  // =======================================================

  async function handleRecording(file: { uri: string; name: string; type: string }) {
    setPhase("processing");
    speak("One moment.");

    try {
      const result = await api.voiceQuery(file);
      setTranscript(result.transcript || null);

      const config = result.intent && INTENT_CONFIG[result.intent];
      if (config && result.consultation_id) {
        await playAnswer(config, result.consultation_id);
      } else {
        setPhase("error");
        const text = "Sorry, I didn't understand, or nothing released yet was found to answer that.";
        setMessage(text);
        speak(text);
      }
    } catch (e: any) {
      setPhase("error");
      setMessage(e.message);
      speak("Something went wrong. Please try again.");
    }
  }

  async function playAnswer(config: { url: (api: any, id: string) => string; label: string }, consultationId: string) {
    try {
      const file = await downloadAuthedFile(config.url(api, consultationId), `voice_answer_${Date.now()}`, ".mp3");
      if (!answerPlayerRef.current) answerPlayerRef.current = createAudioPlayer(null);
      const player = answerPlayerRef.current;
      const sub = player.addListener("playbackStatusUpdate", (status: any) => {
        if (status.didJustFinish) {
          sub.remove();
          setPhase("idle");
        }
      });
      setSpeakingLabel(config.label);
      setPhase("speaking");
      player.replace(file.uri);
      player.play();
    } catch (e: any) {
      setPhase("error");
      setMessage(e.message);
      speak("Sorry, that audio could not be played.");
    }
  }

  if (!isPatient) return null;

  const busy = phase === "preparing" || phase === "listening" || phase === "processing" || phase === "speaking";
  const micDisabled = phase === "preparing" || phase === "processing";

  const statusText =
    phase === "idle"
      ? voiceWakeEnabled
        ? wakeListening
          ? '\ud83c\udfa7 Hands-free is on \u2014 say "Hey Doctor" anytime, or tap the microphone'
          : "\ud83c\udfa7 Hands-free is on \u2014 reconnecting\u2026"
        : 'Tap the microphone and ask, for example: "What was my prescription?" or "What is the doctor\'s advice?"'
      : phase === "preparing"
        ? "Get ready\u2026"
        : phase === "listening"
          ? "\ud83c\udf99\ufe0f Listening\u2026 (tap again to stop)"
          : phase === "processing"
            ? "\u23f3 Processing your question\u2026"
            : phase === "speaking"
              ? `\ud83d\udd0a Reading ${speakingLabel || "your answer"}\u2026 (tap to stop)`
              : message;

  const micLabel = phase === "listening" ? "Stop recording" : phase === "speaking" ? "Stop reading" : "Ask a question about your visit";

  return (
    <>
      {collapsed ? (
        <Pressable
          onPress={() => setCollapsedPersist(false)}
          accessibilityLabel={voiceWakeEnabled ? "Show voice assistant (hands-free is on)" : "Show voice assistant"}
          style={{ position: "absolute", left: 18, bottom: insets.bottom + 18 }}
          className="size-[54px] items-center justify-center rounded-full bg-white shadow-lg"
        >
          <Mic size={24} color="#0f172a" />
          {voiceWakeEnabled && (
            <View
              className={`absolute right-1 top-1 size-3 rounded-full border-2 border-white ${wakeListening ? "bg-emerald-500" : "bg-amber-500"}`}
            />
          )}
        </Pressable>
      ) : (
        <View
          style={{ position: "absolute", left: 18, bottom: insets.bottom + 18, width: 300 }}
          className="rounded-2xl bg-white p-3.5 shadow-lg"
        >
          <View className="flex-row items-start justify-between gap-2">
            <Text className="text-sm font-bold text-slate-900">{"\ud83c\udfa4"} Ask about your visit</Text>
            <Pressable
              onPress={() => setCollapsedPersist(true)}
              accessibilityLabel="Minimize voice assistant"
              className="size-9 items-center justify-center rounded-lg bg-slate-100"
            >
              <X size={14} color="#475569" />
            </Pressable>
          </View>

          <Pressable
            onPress={handleMicClick}
            disabled={micDisabled}
            accessibilityLabel={micLabel}
            className={`mx-auto my-3 size-[72px] items-center justify-center rounded-full ${
              phase === "listening" || phase === "speaking" ? "bg-red-500" : "bg-blue-600"
            } ${micDisabled ? "opacity-60" : ""}`}
          >
            {phase === "listening" || phase === "speaking" ? (
              <Square size={26} color="#fff" fill="#fff" />
            ) : (
              <Mic size={28} color="#fff" />
            )}
          </Pressable>

          <Text className="text-center text-xs text-slate-500" accessibilityLiveRegion="polite">
            {statusText}
          </Text>

          {transcript && (
            <Text className="mt-2 text-center text-[11px] text-slate-400">Heard: "{transcript}"</Text>
          )}

          <Pressable
            onPress={voiceWakeForced ? undefined : toggleWake}
            disabled={voiceWakeForced}
            className={`mt-3 min-h-[44px] items-center justify-center rounded-lg bg-slate-100 px-3 py-2.5 ${voiceWakeForced ? "opacity-75" : ""}`}
          >
            <Text className="text-center text-xs font-semibold text-slate-700">
              {voiceWakeForced
                ? "\ud83c\udfa7 Hands-free is always ON for your account"
                : voiceWakeEnabled
                  ? '\ud83c\udfa7 Hands-free is ON \u2014 say "Hey Doctor" (tap to turn off)'
                  : '\ud83c\udfa7 Turn on hands-free ("Hey Doctor")'}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
