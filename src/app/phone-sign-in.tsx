import { useEffect, useRef, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Stethoscope, Phone, KeyRound, Mic } from "lucide-react-native";
import { api } from "@/api/client";
import { useAuth } from "@/api/auth";

// Same digit-word normalisation as the website's PhoneSignIn.jsx - Chrome's
// (and the native platform recognizers') transcription of spoken digits
// varies between numerals and words depending on cadence.
const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

function extractDigits(transcript: string) {
  const words = (transcript || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/);
  let digits = "";
  for (const w of words) {
    if (/^\d+$/.test(w)) digits += w;
    else if (WORD_TO_DIGIT[w]) digits += WORD_TO_DIGIT[w];
  }
  return digits;
}

// Native equivalent of speakAndWait in PhoneSignIn.jsx - resolves once the
// utterance actually finishes (with a timeout fallback), so the voice-driven
// flow doesn't start listening while still mid-prompt. expo-speech's
// Speech.speak() is callback-based rather than promise-based, hence the wrap.
function speakAndWait(text: string, maxWaitMs = 4000): Promise<void> {
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

type CaptureState = {
  minDigits: number;
  transcript: string;
  settled: boolean;
  resolve: (digits: string) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

// Phone-call sign-in for a patient who can't independently find and tap an
// emailed magic link - mimicked from the website's PhoneSignIn.jsx.
export default function PhoneSignIn() {
  const { applySession } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ voiceStart?: string }>();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  const voiceStartedRef = useRef(false);
  const mountedRef = useRef(true);
  // Bridges expo-speech-recognition's event-based API (one set of listeners
  // for the module's whole lifetime) into the one-shot Promise shape
  // captureDigits() needs, mirroring what a fresh `new SpeechRecognitionCtor()`
  // gave the web version for free per call.
  const captureRef = useRef<CaptureState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
      Speech.stop();
    };
  }, []);

  // Arrived here via the "Hey Doctor" wake phrase (useWakePhraseSignIn) -
  // run the whole phone-number -> call -> code flow by voice instead of
  // waiting for typed input. The manual form still works throughout, in
  // case recognition mishears something.
  useEffect(() => {
    if (params.voiceStart === "true" && !voiceStartedRef.current) {
      voiceStartedRef.current = true;
      setVoiceActive(true);
      // Clears the param so a later revisit of this screen (back button,
      // deep link) doesn't silently re-trigger the voice flow.
      router.setParams({ voiceStart: undefined });
      runVoiceFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishCapture(fn: () => void) {
    const c = captureRef.current;
    if (!c || c.settled) return;
    c.settled = true;
    clearTimeout(c.timeoutId);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    fn();
  }

  // Promise-based capture, shared by the manual "Speak your code" button and
  // the automatic voice flow below. Continuous + a generous timeout - the
  // real call needs time to ring, connect, and start talking before the
  // patient has anything to repeat.
  function captureDigits(minDigits = 4, timeoutMs = 25000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(
        () => finishCapture(() => reject(new Error("timeout"))),
        timeoutMs,
      );
      captureRef.current = { minDigits, transcript: "", settled: false, resolve, reject, timeoutId };
      try {
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: false,
          continuous: true,
        });
      } catch (e) {
        finishCapture(() => reject(e instanceof Error ? e : new Error("start-failed")));
      }
    });
  }

  useSpeechRecognitionEvent("start", () => setListening(true));

  useSpeechRecognitionEvent("result", (event) => {
    const c = captureRef.current;
    if (!c || c.settled) return;
    c.transcript += " " + (event.results?.[0]?.transcript || "");
    const digits = extractDigits(c.transcript);
    if (digits.length >= c.minDigits) finishCapture(() => c.resolve(digits));
  });

  useSpeechRecognitionEvent("error", (event) => {
    const c = captureRef.current;
    if (!c || c.settled) return;
    // Expected while still waiting for the call to connect - keep listening.
    if (event.error === "no-speech" || event.error === "aborted") return;
    finishCapture(() => c.reject(new Error(event.error || "speech-error")));
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    const c = captureRef.current;
    if (!c || c.settled) return;
    const digits = extractDigits(c.transcript);
    if (digits) finishCapture(() => c.resolve(digits));
    else finishCapture(() => c.reject(new Error(`heard:${c.transcript.trim()}`)));
  });

  async function captureWithRetries(attempts: number, retryPrompt: string, minDigits = 4) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await captureDigits(minDigits);
      } catch {
        if (i < attempts - 1) await speakAndWait(retryPrompt, 3000);
      }
    }
    return null;
  }

  async function runVoiceFlow() {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      await speakAndWait(
        "I need microphone access to sign you in by voice. Please type your phone number in below.",
      );
      return;
    }

    await speakAndWait("I'll help you sign in. Please say your phone number now.", 4000);
    const phoneDigits = await captureWithRetries(
      3,
      "Sorry, I didn't catch that. Please say your phone number again.",
      10,
    );
    if (!mountedRef.current) return;
    if (!phoneDigits) {
      await speakAndWait(
        "I couldn't understand your phone number. Please type it in below, or say Hey Doctor to try again.",
      );
      return;
    }
    setPhone(phoneDigits);
    await speakAndWait(`Calling ${phoneDigits.split("").join(" ")} now.`, 3500);
    if (!mountedRef.current) return;

    setErr(null);
    setBusy(true);
    let startRes;
    try {
      startRes = await api.phoneLoginStart(phoneDigits);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setBusy(false);
      setErr(e.message);
      await speakAndWait(`Something went wrong. ${e.message}`, 4000);
      return;
    }
    if (!mountedRef.current) return;
    setInfo(startRes.message);
    setStep("code");
    setBusy(false);

    await speakAndWait(
      "I'm calling you now. When you hear your code on the call, say the digits here.",
      4000,
    );
    const codeDigits = await captureWithRetries(
      3,
      "Sorry, I didn't catch that. Please say the code again.",
    );
    if (!mountedRef.current) return;
    if (!codeDigits) {
      await speakAndWait(
        "I couldn't catch the code. Please type it in below, or tap Speak your code to try again.",
      );
      return;
    }
    setOtp(codeDigits);

    setErr(null);
    setBusy(true);
    try {
      const t = await api.phoneLoginVerify(phoneDigits, codeDigits);
      await applySession(t);
      if (!mountedRef.current) return;
      await speakAndWait("You're signed in.", 2000);
      router.replace("/");
    } catch (e: any) {
      if (!mountedRef.current) return;
      setBusy(false);
      setErr(e.message);
      await speakAndWait(`That code didn't work. ${e.message}`, 3500);
    }
  }

  async function listenForCode() {
    if (listening) return;
    setErr(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setErr("Microphone permission is needed to speak your code. Try again or type it in.");
      return;
    }
    try {
      const digits = await captureDigits();
      setOtp(digits);
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.startsWith("heard:")) {
        setErr(`Heard "${e.message.slice(6)}" - couldn't make out a code. Try again or type it in.`);
      } else {
        setErr("Couldn't hear you clearly. Try again or type the code in.");
      }
    }
  }

  async function requestCall() {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.phoneLoginStart(phone.trim());
      setInfo(res.message);
      setStep("code");
      Speech.speak("Say the code you heard on the call, one digit at a time.");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setErr(null);
    setBusy(true);
    try {
      const t = await api.phoneLoginVerify(phone.trim(), otp.trim());
      await applySession(t);
      router.replace("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1">
      {/* RN has no radial-gradient, so a diagonal linear gradient stands in
          for the web version's radial wash - same approach as HomeNav. */}
      <LinearGradient
        colors={["#792884", "#4ab96a", "#792884"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <View className="flex-1 items-center justify-center p-6">
        <View className="mb-7 w-full max-w-[400px]">
          <Link href="/" asChild>
            <Pressable className="flex-row items-center gap-2.5 self-start">
              <View className="size-8 items-center justify-center rounded-lg bg-[#792884]">
                <Stethoscope size={16} color="#fff" strokeWidth={2} />
              </View>
              <Text className="text-base font-semibold tracking-tight text-white">
                AI Healthcare<Text className="text-[#4ab96a]">+</Text>
              </Text>
            </Pressable>
          </Link>
        </View>

        <View className="w-full max-w-[400px] rounded-2xl bg-white p-8 pt-9 shadow-xl">
          <Text className="mb-1.5 text-xl font-bold tracking-tight text-slate-900">
            Sign in by phone call
          </Text>
          <Text className="mb-4 text-sm text-slate-500">
            {step === "phone"
              ? "We'll call your phone and read your sign-in code aloud - no password or email needed."
              : "Listen for the code read out on the call, then enter it below."}
          </Text>

          {voiceActive && (
            <View className="mb-5 flex-row items-center gap-2 rounded-lg bg-[#4ab96a]/10 px-3 py-2.5">
              <Mic size={14} color="#2f8f4e" strokeWidth={2} />
              <Text className="text-xs font-medium text-[#2f8f4e]">
                {listening
                  ? "Listening…"
                  : "Voice sign-in in progress - you can also type below"}
              </Text>
            </View>
          )}

          {step === "phone" && (
            <View>
              <Text className="mb-1.5 text-xs font-semibold text-slate-700">
                Your phone number
              </Text>
              <View className="mb-1.5 flex-row items-center rounded-lg border border-slate-200 px-3">
                <Phone size={16} color="#94a3b8" />
                <TextInput
                  autoFocus
                  keyboardType="phone-pad"
                  placeholder="e.g. 03001234567"
                  placeholderTextColor="#94a3b8"
                  value={phone}
                  onChangeText={setPhone}
                  className="ml-2 flex-1 py-3 text-sm text-slate-900"
                />
              </View>

              {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

              <Pressable
                onPress={requestCall}
                disabled={busy || !phone.trim()}
                className={`mt-5 items-center rounded-lg py-3 ${
                  busy || !phone.trim() ? "bg-[#4ab96a]/50" : "bg-[#4ab96a]"
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-sm font-semibold text-white">Call me with my code</Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "code" && (
            <View>
              {info && (
                <View className="mb-4 rounded-lg bg-emerald-50 px-4 py-3.5">
                  <Text className="text-[13px] text-emerald-900">{info}</Text>
                </View>
              )}

              <Text className="mb-1.5 text-xs font-semibold text-slate-700">
                Code from the call
              </Text>
              <View className="mb-1.5 flex-row items-center rounded-lg border border-slate-200 px-3">
                <KeyRound size={16} color="#94a3b8" />
                <TextInput
                  autoFocus
                  keyboardType="number-pad"
                  placeholder="e.g. 1234"
                  placeholderTextColor="#94a3b8"
                  value={otp}
                  onChangeText={setOtp}
                  className="ml-2 flex-1 py-3 text-sm text-slate-900"
                />
              </View>

              <Pressable
                onPress={listenForCode}
                disabled={listening}
                className={`mt-2 flex-row items-center justify-center gap-2 rounded-lg border py-2.5 ${
                  listening ? "border-[#4ab96a] bg-[#4ab96a]/10" : "border-slate-200"
                }`}
              >
                <Mic size={16} color={listening ? "#2f8f4e" : "#475569"} strokeWidth={2} />
                <Text
                  className={`text-sm font-semibold ${
                    listening ? "text-[#2f8f4e]" : "text-slate-600"
                  }`}
                >
                  {listening ? "Listening… say the digits" : "Speak your code instead"}
                </Text>
              </Pressable>

              {err && <Text className="mt-2 text-xs font-medium text-red-600">{err}</Text>}

              <Pressable
                onPress={verifyCode}
                disabled={busy || !otp.trim()}
                className={`mt-5 items-center rounded-lg py-3 ${
                  busy || !otp.trim() ? "bg-[#792884]/50" : "bg-[#792884]"
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-sm font-semibold text-white">Sign in</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep("phone");
                  setOtp("");
                  setErr(null);
                  setInfo(null);
                }}
                className="mt-3 items-center"
              >
                <Text className="text-xs font-semibold text-[#2f8f4e]">
                  Didn't get a call? Try again
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-4 items-center">
            <Link href="/login" asChild>
              <Pressable>
                <Text className="text-xs font-semibold text-[#4ab96a]">Back to sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </View>
  );
}
