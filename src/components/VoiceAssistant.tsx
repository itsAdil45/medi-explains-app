import { useEffect, useRef, useState } from "react";
import { AppState, View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  type AudioPlayer,
} from "expo-audio";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Mic, Square, X } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { useAccessibility } from "@/context/AccessibilityContext";
import { downloadAuthedFile } from "@/api/download";
import { cancelSpeech, prefetchPrompts, say, speakPrompt, useVoiceStrings } from "@/voice/speech";
import { containsWakePhrase, isRtl, markLocaleUnsupported, recognitionLocale } from "@/voice/voiceLang";
import { watchRecorderForEndOfSpeech } from "@/voice/endOfSpeech";

// Single tap, no second one needed: the recording ends by itself once the
// patient stops talking (see endOfSpeech.ts) - more reliable for a screen-
// reader or low-vision user than re-finding the button, and unlike the old
// fixed 10s window it doesn't cut off a longer question. Tapping still ends
// it early. Metering feeds that silence detection.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

const AS_COLLAPSED = "mxp_voice_widget_collapsed";

// Maps a matched voice_query.py intent to which audio endpoint answers it
// and the voice-prompt key labelling it in the status text. Keep in sync
// with the backend's voice_query.py _INTENT_KEYWORDS keys. "medicine" isn't
// a keyword intent - the backend returns it when a prescribed medicine is
// named in the question.
type Answer = { consultation_id: string | number; medication_id?: string | number };
const INTENT_CONFIG: Record<string, { url: (a: Answer) => string; label: string }> = {
  prescription: { url: (a) => api.prescriptionAudioUrl(a.consultation_id), label: "va_label_prescription" },
  advice: { url: (a) => api.adviceAudioUrl(a.consultation_id), label: "va_label_advice" },
  symptoms: { url: (a) => api.symptomsAudioUrl(a.consultation_id), label: "va_label_symptoms" },
  summary: { url: (a) => api.audioSummaryUrl(a.consultation_id), label: "va_label_summary" },
  medicine: {
    url: (a) => api.medicineAudioUrl(a.consultation_id, a.medication_id as string | number),
    label: "va_label_medicine",
  },
};

// What a question always speaks - warmed on mount so the first one isn't
// held up by synthesis. The rest load on demand (speakPrompt).
const ASSISTANT_PROMPTS = ["va_ask_after_beep", "va_one_moment", "va_not_understood"];

// Unique per answer, so a file still being played is never overwritten.
let answerSeq = 0;
const answerFileName = () => `voice_answer_${Date.now()}_${answerSeq++}`;

type Phase = "idle" | "preparing" | "listening" | "processing" | "speaking" | "error";

export default function VoiceAssistant() {
  const { user } = useAuth();
  const isPatient = user?.role === "patient";
  const { voiceWakeEnabled, setVoiceWakeEnabled, voiceWakeForced } = useAccessibility();
  const insets = useSafeAreaInsets();
  // Rendered on more than one screen (Dashboard, and a consultation pushed
  // on top of it), and there's one recognizer for the whole app - only the
  // instance on the screen in front listens.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  // Everything this widget says, shows and listens for follows the
  // patient's profile language; the answers themselves come back from the
  // backend in that language too.
  const lang = user?.preferred_language || "en";
  const t = useVoiceStrings(lang);
  // Speech started from long-lived recognizer callbacks reads the language
  // through this ref - their closures can predate it.
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const rtl = isRtl(lang);
  const dirStyle = { writingDirection: rtl ? "rtl" : "ltr" } as const;
  useEffect(() => {
    if (isPatient) prefetchPrompts(lang, ASSISTANT_PROMPTS);
  }, [isPatient, lang]);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setVoiceWakeEnabled(true);
    AsyncStorage.getItem(AS_COLLAPSED).then((v) => {
      if (v != null) setCollapsed(v === "true");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    AsyncStorage.setItem(AS_COLLAPSED, String(v)).catch(() => {});
  }

  const [phase, setPhase] = useState<Phase>("idle");
  // A voice-prompt key, translated at render - long-lived recognizer
  // callbacks set it, and their `t` can predate the patient's language.
  const [message, setMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [speakingLabel, setSpeakingLabel] = useState("");
  // Whether the wake-word recognizer is actually running right now - distinct
  // from voiceWakeEnabled (the patient's saved preference), since it's
  // deliberately paused while a question is being captured/answered.
  const [wakeListening, setWakeListening] = useState(false);

  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const answerPlayerRef = useRef<AudioPlayer | null>(null);
  const beepPlayerRef = useRef<AudioPlayer | null>(null);
  const endOfSpeechRef = useRef<(() => void) | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeActiveRef = useRef(false);
  const wakeLocaleRef = useRef("en-US");
  // Remaining answer URLs still to play - a question naming a date with two
  // visits on it is answered once per visit, back to back.
  const queueRef = useRef<string[]>([]);
  const answerSubRef = useRef<{ remove: () => void } | null>(null);

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

  // This component stays mounted on whichever screen renders it but not
  // once that screen is gone - and startListening/handleRecording/playNext
  // are multi-step async flows. Leaving the screen mid-flow doesn't cancel
  // that promise chain, so without this a stale prompt or answer could
  // still play after the patient had already navigated away.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  function safeSay(key: string) {
    if (mountedRef.current) say(langRef.current, key);
  }
  function fail(key: string) {
    if (!mountedRef.current) return;
    setPhase("error");
    setMessage(key);
    say(langRef.current, key);
  }

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
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    setMessage(null);
    setTranscript(null);

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error("no-permission");

      // Speak the prompt to completion BEFORE recording starts, so the mic
      // isn't picking up the prompt itself (or the end-of-speech detector
      // taking it for the patient).
      setPhase("preparing");
      await speakPrompt(langRef.current, "va_ask_after_beep", { maxWaitMs: 4000 });
      // Left the screen (or tapped stop) while the prompt was playing.
      if (!mountedRef.current || !focusedRef.current || (phaseRef.current as Phase) !== "preparing") return;

      // iOS refuses to record unless the session allows it.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      await playBeep();
      audioRecorder.record();
      setPhase("listening");
      endOfSpeechRef.current = watchRecorderForEndOfSpeech(audioRecorder, () => finishRecording());
    } catch {
      fail("va_mic_required");
    }
  }

  async function finishRecording() {
    endOfSpeechRef.current?.();
    endOfSpeechRef.current = null;
    if (!audioRecorder.isRecording) return;
    try {
      await audioRecorder.stop();
    } catch {}
    // Back to a playback session, so answers come out of the loudspeaker
    // rather than the earpiece on iOS.
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (!mountedRef.current) return;
    const uri = audioRecorder.uri;
    if (uri) {
      handleRecording({ uri, name: "question.m4a", type: "audio/m4a" });
    } else {
      setPhase("idle");
    }
  }

  // Interrupts the spoken answer mid-playback.
  function stopSpeaking() {
    queueRef.current = [];
    answerSubRef.current?.remove();
    answerSubRef.current = null;
    try {
      answerPlayerRef.current?.pause();
    } catch {}
    cancelSpeech();
    // Synchronously too - an in-flight flow checks phaseRef right after the
    // speech it was awaiting gets cancelled, before a re-render would.
    phaseRef.current = "idle";
    setPhase("idle");
  }

  // Leaving the screen mid-question: drop the recording unsent and stop
  // anything being spoken.
  function stopForBlur() {
    endOfSpeechRef.current?.();
    endOfSpeechRef.current = null;
    if (audioRecorder.isRecording) {
      audioRecorder.stop().catch(() => {});
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    stopSpeaking();
  }

  function handleMicClick() {
    // Tapping again while listening ends the recording immediately, without
    // waiting for the end-of-speech silence.
    if (phase === "listening") finishRecording();
    else if (phase === "speaking") stopSpeaking();
    else startListening();
  }

  // =======================================================
  // WAKE PHRASE
  // =======================================================

  async function startWakeListening() {
    if (wakeActiveRef.current) return;
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    if (!focusedRef.current || AppState.currentState !== "active") return;
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted || wakeActiveRef.current || !focusedRef.current) return;
    try {
      wakeActiveRef.current = true;
      // Listens in the patient's language (English "Hey Doctor" still
      // matches - see voiceLang.ts).
      wakeLocaleRef.current = recognitionLocale(langRef.current);
      ExpoSpeechRecognitionModule.start({
        lang: wakeLocaleRef.current,
        interimResults: false,
        continuous: true,
      });
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
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    }
    // wakeListening itself goes false on the recognizer's "end" event.
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
      // preference off, rather than silently failing forever. Updated
      // synchronously so "end" below can't read a stale "still enabled".
      wakeEnabledRef.current = false;
      setVoiceWakeEnabled(false);
      wakeActiveRef.current = false;
      setPhase("error");
      setMessage("va_mic_denied_handsfree");
    } else if (event.error === "language-not-supported" && !markLocaleUnsupported(wakeLocaleRef.current)) {
      wakeEnabledRef.current = false;
      setVoiceWakeEnabled(false);
    }
    // 'no-speech' and 'aborted' fire routinely in continuous mode during
    // ordinary silence - not real errors. An unsupported locale restarts
    // from "end" on the next fallback one.
  });

  useSpeechRecognitionEvent("end", () => {
    // One recognizer app-wide: whatever just ended, nothing is listening.
    setWakeListening(false);
    if (!wakeActiveRef.current) return;
    wakeActiveRef.current = false;
    // Continuous mode still ends on its own periodically (silence timeouts,
    // OS quirks) - restart automatically unless the patient turned it off,
    // a question is actively in flight, or this screen isn't in front.
    if (wakeEnabledRef.current && (phaseRef.current === "idle" || phaseRef.current === "error")) {
      restartTimerRef.current = setTimeout(startWakeListening, 300);
    }
  });

  function toggleWake() {
    const next = !voiceWakeEnabled;
    setVoiceWakeEnabled(next);
    if (next) {
      setMessage(null);
      say(langRef.current, "va_handsfree_on");
      startWakeListening();
    } else {
      stopWakeListening();
    }
  }

  // Resume wake listening once back at idle/error (an answer finished,
  // was interrupted, or a question wasn't understood), and whenever this
  // screen comes back to the front; release the recognizer when it leaves.
  useEffect(() => {
    if (!focused) {
      stopWakeListening();
      // Tab screens stay mounted when the patient moves on, so a question
      // being recorded or an answer being read out has to be stopped here -
      // otherwise it carries on over the next screen.
      if (phaseRef.current !== "idle" && phaseRef.current !== "error") {
        stopForBlur();
      }
      return;
    }
    if (voiceWakeEnabled && !wakeActiveRef.current && (phase === "idle" || phase === "error")) {
      startWakeListening();
    }
  }, [phase, voiceWakeEnabled, focused]);

  // Switch a running recognizer over once the patient's language is known
  // (or changes).
  useEffect(() => {
    if (wakeActiveRef.current) {
      stopWakeListening();
      startWakeListening();
    }
  }, [lang]);

  // Back in the foreground: the OS stopped the recognizer while the app was
  // in the background, so start a fresh one.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopWakeListening();
      else if (wakeEnabledRef.current) restartTimerRef.current = setTimeout(startWakeListening, 300);
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      stopWakeListening();
      endOfSpeechRef.current?.();
      // No explicit audioRecorder.stop() here on purpose: useAudioRecorder
      // releases its native recorder itself when this component unmounts
      // (which also ends any in-progress recording), and that release runs
      // before this cleanup - so touching audioRecorder here throws "Cannot
      // use shared object that was already released".
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
    safeSay("va_one_moment");

    try {
      const result = await api.voiceQuery(file);
      if (!mountedRef.current) return;
      setTranscript(result.transcript || null);

      const config = result.intent && INTENT_CONFIG[result.intent];
      const answers: Answer[] = result.answers?.length
        ? result.answers
        : result.consultation_id
          ? [{ consultation_id: result.consultation_id }]
          : [];
      if (config && answers.length) {
        queueRef.current = answers.map((a) => config.url(a));
        setSpeakingLabel(config.label);
        await playNext();
      } else if (result.reason === "no_visit_on_date") {
        fail("va_no_visit_on_date");
      } else {
        fail("va_not_understood");
      }
    } catch {
      fail("va_error");
    }
  }

  async function playNext() {
    const next = queueRef.current.shift();
    if (!next) {
      if (mountedRef.current) setPhase("idle");
      return;
    }
    try {
      const file = await downloadAuthedFile(next, answerFileName(), ".mp3");
      // Stopped, or left the screen, while this one was still downloading.
      if (!mountedRef.current || !focusedRef.current) return;
      if (phaseRef.current !== "processing" && phaseRef.current !== "speaking") return;
      if (!answerPlayerRef.current) answerPlayerRef.current = createAudioPlayer(null);
      const player = answerPlayerRef.current;
      answerSubRef.current?.remove();
      const sub = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          sub.remove();
          answerSubRef.current = null;
          if (mountedRef.current && phaseRef.current === "speaking") playNext();
        }
      });
      answerSubRef.current = sub;
      setPhase("speaking");
      phaseRef.current = "speaking";
      player.replace(file.uri);
      player.play();
    } catch {
      queueRef.current = [];
      fail("va_audio_failed");
    }
  }

  if (!isPatient) return null;

  const micDisabled = phase === "preparing" || phase === "processing";

  const statusText = {
    idle: voiceWakeEnabled
      ? `\ud83c\udfa7 ${wakeListening ? t("va_status_handsfree") : t("va_status_reconnecting")}`
      : t("va_status_idle"),
    preparing: t("va_status_preparing"),
    listening: `\ud83c\udf99\ufe0f ${t("va_status_listening")}`,
    processing: `\u23f3 ${t("va_status_processing")}`,
    speaking: `\ud83d\udd0a ${t("va_status_speaking", { label: t(speakingLabel || "va_label_answer") })}`,
    error: message ? t(message) : "",
  }[phase];

  const micLabel =
    phase === "listening" ? t("va_mic_stop_recording") : phase === "speaking" ? t("va_mic_stop_reading") : t("va_mic_ask");

  return (
    <>
      {collapsed ? (
        <Pressable
          onPress={() => setCollapsedPersist(false)}
          accessibilityLabel={voiceWakeEnabled ? `${t("va_show")} — ${t("va_status_handsfree")}` : t("va_show")}
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
          style={{
            position: "absolute",
            left: 18,
            bottom: insets.bottom + 18,
            width: 300,
          }}
          className="rounded-2xl bg-white p-3.5 shadow-lg"
        >
          <View className={`items-start justify-between gap-2 ${rtl ? "flex-row-reverse" : "flex-row"}`}>
            <Text className="flex-1 text-sm font-bold text-slate-900" style={dirStyle}>
              {"\ud83c\udfa4"} {t("va_title")}
            </Text>
            <Pressable
              onPress={() => setCollapsedPersist(true)}
              accessibilityLabel={t("va_minimize")}
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
              phase === "listening" || phase === "speaking"
                ? "bg-red-500"
                : "bg-blue-600"
            } ${micDisabled ? "opacity-60" : ""}`}
          >
            {phase === "listening" || phase === "speaking" ? (
              <Square size={26} color="#fff" fill="#fff" />
            ) : (
              <Mic size={28} color="#fff" />
            )}
          </Pressable>

          <Text
            className="text-center text-xs text-slate-500"
            style={dirStyle}
            accessibilityLiveRegion="polite"
          >
            {statusText}
          </Text>

          {transcript && (
            <Text className="mt-2 text-center text-[11px] text-slate-400" style={dirStyle}>
              {t("va_heard", { text: transcript })}
            </Text>
          )}

          <Pressable
            onPress={voiceWakeForced ? undefined : toggleWake}
            disabled={voiceWakeForced}
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceWakeEnabled, disabled: voiceWakeForced }}
            className={`mt-3 min-h-[44px] items-center justify-center rounded-lg bg-slate-100 px-3 py-2.5 ${voiceWakeForced ? "opacity-75" : ""}`}
          >
            <Text className="text-center text-xs font-semibold text-slate-700" style={dirStyle}>
              {"\ud83c\udfa7"}{" "}
              {voiceWakeForced
                ? t("va_handsfree_forced")
                : voiceWakeEnabled
                  ? t("va_handsfree_toggle_on")
                  : t("va_handsfree_toggle_off")}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
