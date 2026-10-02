import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { containsWakePhrase, markLocaleUnsupported, recognitionLocale } from "@/voice/voiceLang";

// Listens for "Hey Doctor" (in `lang` or English - see voiceLang.ts) and
// sends the visitor straight into the voice-driven phone sign-in flow.
// Shared by every unauthenticated entry point (Login, Home) - a blind
// patient may land on either one first, and neither has a menu to tap their
// way to phone sign-in, so this has to run unprompted, no toggle required,
// wherever they arrive.
//
// Native equivalent of the web hook's window.SpeechRecognition: uses
// expo-speech-recognition, which mirrors the Web Speech API's start/stop +
// event model. Requires a development build (not Expo Go) since it's a
// native module. There's one recognizer for the whole app, so this only
// listens while its screen is focused and the app is in the foreground -
// a screen left mounted underneath (Login under phone-sign-in) used to
// either fight the next screen for the mic or stay deaf after coming back.
export function useWakePhraseSignIn(lang = "en") {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const [supported, setSupported] = useState(true);
  // Whether this screen still wants to be listening - false once blurred,
  // once the wake phrase was heard, or while the mic is refused.
  const activeRef = useRef(false);
  // This hook's own session - the module's events reach every listener in
  // the app, including another screen's recognizer.
  const ownsRef = useRef(false);
  const localeRef = useRef("en-US");
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  function stopRecognizer() {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    if (ownsRef.current) {
      ownsRef.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    }
    setListening(false);
  }

  function scheduleRestart(ms: number) {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(startWakeListening, ms);
  }

  function startWakeListening() {
    if (!activeRef.current || AppState.currentState !== "active") return;
    stopRecognizer();
    localeRef.current = recognitionLocale(langRef.current);
    try {
      ownsRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: localeRef.current,
        interimResults: true,
        continuous: true,
      });
    } catch {
      ownsRef.current = false;
      setSupported(false);
    }
  }

  // Listens while this screen is focused; restarts in the new language when
  // the visitor picks one.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      activeRef.current = true;
      (async () => {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (cancelled) return;
        if (!result.granted) {
          setDenied(true);
          activeRef.current = false;
          return;
        }
        setDenied(false);
        startWakeListening();
      })();
      return () => {
        cancelled = true;
        activeRef.current = false;
        stopRecognizer();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lang]),
  );

  // Back in the foreground: the OS stopped the recognizer while the app was
  // in the background, so start a fresh one.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeRef.current) scheduleRestart(300);
      else if (state !== "active") stopRecognizer();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSpeechRecognitionEvent("start", () => {
    if (ownsRef.current) setListening(true);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!ownsRef.current || !activeRef.current) return;
    const text = event.results?.[0]?.transcript || "";
    if (containsWakePhrase(text)) {
      activeRef.current = false;
      stopRecognizer();
      router.push({
        pathname: "/phone-sign-in",
        params: { voiceStart: "true" },
      });
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!ownsRef.current) return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setDenied(true);
      activeRef.current = false;
    } else if (event.error === "language-not-supported" && !markLocaleUnsupported(localeRef.current)) {
      activeRef.current = false;
    }
    // Otherwise "end" follows and restarts - on the next locale in the
    // chain if this one was unsupported.
  });

  useSpeechRecognitionEvent("end", () => {
    if (!ownsRef.current) return;
    ownsRef.current = false;
    setListening(false);
    if (activeRef.current) scheduleRestart(600);
  });

  return { supported, listening, denied };
}
