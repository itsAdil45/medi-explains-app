import { useEffect, useRef, useState } from "react";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { homeRouteFor } from "@/lib/navigation";
import { AppState, View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { Stethoscope, Phone, KeyRound, Mic } from "lucide-react-native";
import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import VoiceLanguagePicker from "@/voice/VoiceLanguagePicker";
import {
  DIGIT_KEYS,
  cancelSpeech,
  isSpeaking,
  prefetchPrompts,
  speakDigits,
  speakPrompt,
  useVoiceStrings,
} from "@/voice/speech";
import {
  digitRecognitionLocales,
  extractDigits,
  isRtl,
  markLocaleUnsupported,
  recognitionLocale,
  useDeviceVoiceLang,
} from "@/voice/voiceLang";

// Everything the voice flow can say, warmed on arrival. A prompt that is
// still being synthesised when it's needed holds the flow up (speakPrompt
// waits rather than switch to an English voice), so warm all of them - each
// is a one-time synthesis per language, cached server-side and on the
// device after that.
const FLOW_PROMPTS = [
  "ps_intro", "ps_phone_retry", "ps_phone_failed", "ps_calling_number",
  "ps_calling_you", "ps_code_retry", "ps_code_failed", "ps_signed_in",
  "ps_code_invalid", "ps_error", "ps_say_code_hint", "va_mic_required", ...DIGIT_KEYS,
];

// The speaker is still playing the tail of a prompt for a moment after it
// reports finishing (Bluetooth especially) - starting the mic straight away
// fed the prompt's last words into the recognizer as the answer.
const AFTER_PROMPT_MS = 500;
// Enough digits for an answer isn't necessarily the whole answer - a
// patient pausing mid-number ("0300... 1234567") or a longer code than the
// minimum. Wait this long for more before taking it.
const SETTLE_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForForeground() {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        sub.remove();
        resolve();
      }
    });
  });
}

type CaptureState = {
  minDigits: number;
  timeoutMs: number;
  locale: string;
  transcript: string;
  // Set by this session's own "start" event. The recognizer is shared app-
  // wide, so a late "end" from a previous session (the Login wake listener,
  // or this screen's last attempt) must not settle this one.
  started: boolean;
  settled: boolean;
  resolve: (digits: string) => void;
  reject: (err: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  settleId: ReturnType<typeof setTimeout> | null;
};

// Phone-call sign-in for a patient who can't independently find and tap an
// emailed magic link - mimicked from the website's PhoneSignIn.jsx. Keyed
// by phone number deliberately: a patient knows their own number by heart.
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
  // What the recognizer last heard - shown during the voice flow so a
  // mis-heard number is visible instead of just a silent retry.
  const [heard, setHeard] = useState("");

  // The patient's language, remembered from their last sign-in on this
  // device (or picked here) - every prompt is spoken and every answer
  // listened for in it. The voice flow is one long async function, so it
  // reads the language through a ref: picking another one mid-flow switches
  // what it says and listens for from the next prompt on.
  const [lang, setLang] = useDeviceVoiceLang();
  const t = useVoiceStrings(lang);
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  const rtl = isRtl(lang);
  const dirStyle = { writingDirection: rtl ? "rtl" : "ltr" } as const;

  useEffect(() => {
    prefetchPrompts(lang, FLOW_PROMPTS);
  }, [lang]);

  const voiceStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const manualTriesRef = useRef(0);
  // Bumped each time the app leaves the foreground - an attempt that spans
  // one was cut off by the OS, not failed by the patient.
  const backgroundCountRef = useRef(0);
  // Bridges expo-speech-recognition's event-based API (one set of listeners
  // for the module's whole lifetime) into the one-shot Promise shape
  // captureDigits() needs, mirroring what a fresh `new SpeechRecognition()`
  // gave the web version for free per call.
  const captureRef = useRef<CaptureState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        backgroundCountRef.current++;
        // The OS stops the recognizer anyway; stopping it here makes the
        // current attempt end now rather than on a timeout.
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {}
      }
    });
    return () => {
      mountedRef.current = false;
      sub.remove();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
      cancelSpeech();
    };
  }, []);

  // Every prompt in the flows below goes through this - leaving the screen
  // doesn't cancel a promise chain already in flight, and a retry prompt
  // could otherwise still play after the patient had backed out.
  function prompt(key: string, maxWaitMs?: number) {
    if (!mountedRef.current) return Promise.resolve();
    return speakPrompt(langRef.current, key, maxWaitMs ? { maxWaitMs } : undefined);
  }

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
    if (c.settleId) clearTimeout(c.settleId);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
    fn();
  }

  // Promise-based capture, shared by the manual "Speak your code" button and
  // the automatic voice flow below. Continuous + a generous timeout - the
  // real call needs time to ring, connect, and start talking before the
  // patient has anything to repeat. locale: which recognizer to listen with
  // (see digitRecognitionLocales); defaults to the patient's language.
  function captureDigits(minDigits = 4, timeoutMs = 25000, locale: string | null = null): Promise<string> {
    return new Promise((resolve, reject) => {
      const lc = locale || recognitionLocale(langRef.current);
      const timeoutId = setTimeout(() => finishCapture(() => reject(new Error("timeout"))), timeoutMs);
      captureRef.current = {
        minDigits, timeoutMs, locale: lc, transcript: "", started: false, settled: false,
        resolve, reject, timeoutId, settleId: null,
      };
      try {
        ExpoSpeechRecognitionModule.start({ lang: lc, interimResults: false, continuous: true });
      } catch (e) {
        finishCapture(() => reject(e instanceof Error ? e : new Error("start-failed")));
      }
    });
  }

  useSpeechRecognitionEvent("start", () => {
    const c = captureRef.current;
    if (!c || c.settled) return;
    c.started = true;
    setListening(true);
    setHeard("");
  });

  useSpeechRecognitionEvent("result", (event) => {
    const c = captureRef.current;
    if (!c || c.settled || !c.started) return;
    // The app's own prompt, picked up by the mic - not the patient.
    if (isSpeaking()) return;
    if (!event.isFinal) return;
    c.transcript += " " + (event.results?.[0]?.transcript || "");
    setHeard(c.transcript.trim());
    const digits = extractDigits(c.transcript);
    if (c.settleId) clearTimeout(c.settleId);
    c.settleId = null;
    if (digits.length >= c.minDigits)
      c.settleId = setTimeout(() => finishCapture(() => c.resolve(extractDigits(c.transcript))), SETTLE_MS);
    // A whole sentence with not one digit in it: most likely the number was
    // said in a language this recognizer isn't listening for - give up now
    // so the next attempt can try the other one, instead of sitting out the
    // full timeout.
    else if (!digits && c.transcript.trim().split(/\s+/).length >= 3)
      finishCapture(() => c.reject(new Error(`heard:${c.transcript.trim()}`)));
  });

  useSpeechRecognitionEvent("error", (event) => {
    const c = captureRef.current;
    if (!c || c.settled) return;
    // Expected while still waiting for the call to connect - keep listening.
    if (event.error === "no-speech" || event.error === "aborted") return;
    // This device can't recognise that language - start over on the next
    // locale in its fallback chain (voiceLang.ts).
    if (event.error === "language-not-supported" && markLocaleUnsupported(c.locale)) {
      finishCapture(() => c.resolve(captureDigits(c.minDigits, c.timeoutMs) as unknown as string));
      return;
    }
    finishCapture(() => c.reject(new Error(event.error || "speech-error")));
  });

  useSpeechRecognitionEvent("end", () => {
    const c = captureRef.current;
    if (!c || !c.started) return;
    setListening(false);
    if (c.settled) return;
    // Only a complete answer counts - a phone number cut short used to be
    // accepted as-is, and the flow then rang whatever partial number it had.
    const digits = extractDigits(c.transcript);
    if (digits.length >= c.minDigits) finishCapture(() => c.resolve(digits));
    else finishCapture(() => c.reject(new Error(`heard:${c.transcript.trim()}`)));
  });

  async function captureWithRetries(attempts: number, retryPromptKey: string, minDigits = 4) {
    const locales = digitRecognitionLocales(langRef.current);
    for (let i = 0; i < attempts; i++) {
      // A backgrounded app can't listen - wait for the patient to come back.
      await waitForForeground();
      if (!mountedRef.current) return null;
      const backgroundBefore = backgroundCountRef.current;
      try {
        await sleep(AFTER_PROMPT_MS);
        return await captureDigits(minDigits, undefined, locales[i % locales.length]);
      } catch {
        if (!mountedRef.current) return null;
        if (backgroundCountRef.current !== backgroundBefore) {
          // Switched away mid-attempt (or answered the call on this same
          // phone): doesn't use up a try. Ask again once they're back.
          await waitForForeground();
          await prompt(retryPromptKey, 3000);
          i--;
          continue;
        }
        if (i < attempts - 1) await prompt(retryPromptKey, 3000);
      }
    }
    return null;
  }

  async function runVoiceFlow() {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!mountedRef.current) return;
    if (!perm.granted) {
      setErr(t("va_mic_required"));
      await prompt("va_mic_required");
      return;
    }

    await prompt("ps_intro");
    if (!mountedRef.current) return;
    // Four tries, so English and the patient's language get two each.
    const phoneDigits = await captureWithRetries(4, "ps_phone_retry", 10);
    if (!mountedRef.current) return;
    if (!phoneDigits) {
      await prompt("ps_phone_failed");
      return;
    }
    setPhone(phoneDigits);
    await prompt("ps_calling_number", 2500);
    if (!mountedRef.current) return;
    await speakDigits(langRef.current, phoneDigits);
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
      await prompt("ps_error");
      return;
    }
    if (!mountedRef.current) return;
    setInfo(startRes.message);
    setStep("code");
    setBusy(false);

    await prompt("ps_calling_you");
    if (!mountedRef.current) return;
    const codeDigits = await captureWithRetries(4, "ps_code_retry");
    if (!mountedRef.current) return;
    if (!codeDigits) {
      await prompt("ps_code_failed");
      return;
    }
    setOtp(codeDigits);

    setErr(null);
    setBusy(true);
    try {
      const tok = await api.phoneLoginVerify(phoneDigits, codeDigits);
      const signedIn = await applySession(tok);
      if (!mountedRef.current) return;
      await prompt("ps_signed_in", 2000);
      router.replace(homeRouteFor(signedIn.role));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setBusy(false);
      setErr(e.message);
      await prompt("ps_code_invalid", 3500);
    }
  }

  async function listenForCode() {
    if (listening) return;
    setErr(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setErr(t("va_mic_required"));
      return;
    }
    try {
      // Each press alternates English / the patient's language, like the
      // automatic flow's retries.
      const locales = digitRecognitionLocales(lang);
      const digits = await captureDigits(4, undefined, locales[manualTriesRef.current++ % locales.length]);
      setOtp(digits);
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.startsWith("heard:")) {
        setErr(t("ps_heard_no_code", { text: e.message.slice(6) }));
      } else {
        setErr(t("ps_cant_hear"));
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
      prompt("ps_say_code_hint").catch(() => {});
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
      const tok = await api.phoneLoginVerify(phone.trim(), otp.trim());
      const signedIn = await applySession(tok);
      router.replace(homeRouteFor(signedIn.role));
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
          <View className={`mb-1.5 items-start justify-between gap-3 ${rtl ? "flex-row-reverse" : "flex-row"}`}>
            <Text className="flex-1 text-xl font-bold tracking-tight text-slate-900" style={dirStyle}>
              {t("ps_title")}
            </Text>
            <VoiceLanguagePicker value={lang} onChange={setLang} label={t("ps_language")} />
          </View>
          <Text className="mb-4 text-sm text-slate-500" style={dirStyle}>
            {step === "phone" ? t("ps_sub_phone") : t("ps_sub_code")}
          </Text>

          {voiceActive && (
            <View
              accessibilityLiveRegion="polite"
              className={`mb-5 items-center gap-2 rounded-lg bg-[#4ab96a]/10 px-3 py-2.5 ${rtl ? "flex-row-reverse" : "flex-row"}`}
            >
              <Mic size={14} color="#2f8f4e" strokeWidth={2} />
              <Text className="flex-1 text-xs font-medium text-[#2f8f4e]" style={dirStyle}>
                {listening ? t("ps_listening") : t("ps_voice_in_progress")}
              </Text>
            </View>
          )}
          {voiceActive && !!heard && (
            <Text className="-mt-3 mb-5 text-xs text-slate-500" style={dirStyle} accessibilityLiveRegion="polite">
              {t("va_heard", { text: heard })} ({extractDigits(heard) || "—"})
            </Text>
          )}

          {step === "phone" && (
            <View>
              <Text className="mb-1.5 text-xs font-semibold text-slate-700" style={dirStyle}>
                {t("ps_phone_label")}
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

              {err && (
                <Text className="mt-2 text-xs font-medium text-red-600" style={dirStyle} accessibilityRole="alert">
                  {err}
                </Text>
              )}

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
                  <Text className="text-sm font-semibold text-white">{t("ps_call_me")}</Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "code" && (
            <View>
              {info && (
                <View className="mb-4 rounded-lg bg-emerald-50 px-4 py-3.5">
                  {/* The backend's own wording is English-only; this is the
                      same deliberately non-committal message. */}
                  <Text className="text-[13px] text-emerald-900" style={dirStyle}>
                    {t("ps_call_sent")}
                  </Text>
                </View>
              )}

              <Text className="mb-1.5 text-xs font-semibold text-slate-700" style={dirStyle}>
                {t("ps_code_label")}
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
                  {listening ? t("ps_listening_digits") : t("ps_speak_code")}
                </Text>
              </Pressable>

              {err && (
                <Text className="mt-2 text-xs font-medium text-red-600" style={dirStyle} accessibilityRole="alert">
                  {err}
                </Text>
              )}

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
                  <Text className="text-sm font-semibold text-white">{t("ps_sign_in")}</Text>
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
                  {t("ps_retry_call")}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mt-4 items-center">
            <Link href="/login" asChild>
              <Pressable>
                <Text className="text-xs font-semibold text-[#4ab96a]">{t("ps_back")}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </View>
  );
}
