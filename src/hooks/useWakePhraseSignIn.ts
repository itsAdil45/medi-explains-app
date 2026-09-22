import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

// Forgiving on purpose, same list as the post-login wake-word assistant -
// a blind patient arriving here for the first time shouldn't need to hit
// one exact phrase.
const WAKE_PHRASES = [
  "hey doctor",
  "hey doc",
  "ok doctor",
  "okay doctor",
  "hello doctor",
  "hey assistant",
];

function containsWakePhrase(text) {
  const t = (text || "").toLowerCase();
  return WAKE_PHRASES.some((p) => t.includes(p));
}

// Listens for "Hey Doctor" and sends the visitor straight into the voice-
// driven phone sign-in flow. Shared by every unauthenticated entry point
// (Login, Home) - a blind patient may land on either one first, and neither
// has a menu to tap their way to phone sign-in, so this has to run
// unprompted, no toggle required, wherever they arrive.
//
// Native equivalent of the web hook's window.SpeechRecognition: uses
// expo-speech-recognition, which mirrors the Web Speech API's start/stop +
// event model. Requires a development build (not Expo Go) since it's a
// native module - see expo-dev-client setup.
export function useWakePhraseSignIn() {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const [supported, setSupported] = useState(true);
  const activeRef = useRef(true);
  const restartTimerRef = useRef(null);

  // Ask for mic + speech-recognition permission once on mount, then start
  // the listen loop if granted.
  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;

    (async () => {
      const result =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (cancelled) return;

      if (!result.granted) {
        setDenied(true);
        activeRef.current = false;
        return;
      }
      startWakeListening();
    })();

    return () => {
      cancelled = true;
      activeRef.current = false;
      clearTimeout(restartTimerRef.current);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startWakeListening() {
    if (!activeRef.current) return;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
      });
    } catch (e) {
      setSupported(false);
    }
  }

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!activeRef.current) return;
    const text = event.results?.[0]?.transcript || "";
    if (containsWakePhrase(text)) {
      activeRef.current = false;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
      router.push({
        pathname: "/phone-sign-in",
        params: { voiceStart: "true" },
      });
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      setDenied(true);
      activeRef.current = false;
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    if (activeRef.current) {
      restartTimerRef.current = setTimeout(startWakeListening, 300);
    }
  });

  return { supported, listening, denied };
}
