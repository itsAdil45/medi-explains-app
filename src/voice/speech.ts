import { useEffect, useState } from "react";
import * as Speech from "expo-speech";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";

import { api } from "@/api/client";
import { downloadAuthedFile } from "@/api/download";

// Spoken prompts and on-screen voice UI text, in the patient's language,
// from the backend catalog (/api/voice-prompts - see the backend's
// services/voice_prompts.py). English keeps using the phone's own voice
// (expo-speech) - instant, no server round-trip. Every other language plays
// a server-synthesised clip instead, since phones have no Urdu/Punjabi/
// Pashto/Sindhi voice on most devices. Ported from the website's
// src/voice/speech.js - keep the two in step.

type Catalog = { version: string | number; strings: Record<string, string> };

const catalogs = new Map<string, Promise<Catalog>>();
const clips = new Map<string, Promise<string>>(); // `${lang}:${key}` -> file uri

export function loadPrompts(lang: string): Promise<Catalog> {
  if (!catalogs.has(lang)) {
    const p = (api.voicePrompts(lang) as Promise<Catalog>).catch((e) => {
      catalogs.delete(lang);
      throw e;
    });
    catalogs.set(lang, p);
  }
  return catalogs.get(lang)!;
}

function format(text: string, vars?: Record<string, string | number>) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => String(vars[k] ?? m)) : text;
}

export type VoiceT = (key: string, vars?: Record<string, string | number>) => string;

// t(key, vars) for the given language. Renders '' for a key until the
// catalog has loaded (it's prefetched on app start - see auth.tsx).
export function useVoiceStrings(lang: string): VoiceT {
  // Tagged with the language they're for, so a switch shows blanks rather
  // than the previous language until the new catalog arrives.
  const [loaded, setLoaded] = useState<{ lang: string; strings: Record<string, string> } | null>(null);
  useEffect(() => {
    let live = true;
    loadPrompts(lang)
      .then((c) => live && setLoaded({ lang, strings: c.strings }))
      .catch(() =>
        loadPrompts("en")
          .then((c) => live && setLoaded({ lang, strings: c.strings }))
          .catch(() => {}),
      );
    return () => {
      live = false;
    };
  }, [lang]);
  const strings = loaded?.lang === lang ? loaded.strings : null;
  return (key, vars) => format(strings?.[key] ?? "", vars);
}

// Clips are saved in the app cache under the catalog version, so they
// survive restarts - each is a cloud TTS request against the provider's
// quota the first time, never again until the wording changes.
function clipUri(lang: string, key: string): Promise<string> {
  const id = `${lang}:${key}`;
  if (!clips.has(id)) {
    const p = loadPrompts(lang)
      .then(async (c) => {
        const base = `vp_${lang}_${key}_${c.version}`.replace(/[^\w.-]/g, "_");
        const cached = new File(Paths.cache, base + ".mp3");
        if (cached.exists && cached.size) return cached.uri;
        const file = await downloadAuthedFile(api.voicePromptAudioUrl(key, lang, c.version), base, ".mp3");
        return file.uri;
      })
      .catch((e) => {
        clips.delete(id);
        throw e;
      });
    clips.set(id, p);
  }
  return clips.get(id)!;
}

// Warms clips that are about to be needed, so the first prompt of a flow
// doesn't wait on synthesis. Keep the list to what's needed first.
export function prefetchPrompts(lang: string, keys: string[]) {
  if (lang === "en") return;
  keys.forEach((k) => clipUri(lang, k).catch(() => {}));
}

let player: AudioPlayer | null = null;
let finishCurrent: (() => void) | null = null;
// Bumped by cancelSpeech() so multi-part speech (speakDigits) stops as a
// whole rather than just skipping to its next part.
let epoch = 0;
// Bumped by every speakPrompt(). A prompt still waiting on its clip when a
// newer one starts gives up instead of playing over it - only one prompt
// is ever audible at a time.
let turn = 0;

function stopCurrent() {
  try {
    Speech.stop();
  } catch {}
  try {
    player?.pause();
  } catch {}
  if (finishCurrent) finishCurrent();
}

// Whether a prompt is audible right now - recognizers use it to drop what
// they hear of the app's own voice.
export function isSpeaking() {
  return finishCurrent !== null;
}

// Stops whatever is being spoken - server clip or device speech - and
// resolves its pending speakPrompt() promise.
export function cancelSpeech() {
  epoch++;
  turn++;
  stopCurrent();
}

// No phone ships a Shahmukhi voice; an Urdu one reads that script far
// better than a Gurmukhi-only Punjabi voice would.
const DEVICE_VOICE: Record<string, string> = { pa_shah: "ur" };

function deviceSpeak(text: string, lang: string, maxWaitMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      finishCurrent = null;
      resolve();
    };
    finishCurrent = finish;
    try {
      Speech.speak(text, {
        language: lang === "en" ? undefined : lang,
        onDone: finish,
        onError: finish,
        onStopped: finish,
      });
    } catch {
      finish();
      return;
    }
    // Don't hang the flow on a missing callback. Sized to the text so a
    // long prompt isn't cut loose mid-sentence, with listening starting
    // over the top of it.
    setTimeout(finish, Math.max(maxWaitMs, text.length * 90));
  });
}

function playClip(uri: string, maxWaitMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (!player) player = createAudioPlayer(null);
    const p = player;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rearmed = false;
    const sub = p.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) finish();
      // Safety net for a missing finish event, re-armed to the clip's real
      // length once known - a fixed cap let the flow move on (and start
      // listening) while a long native-language clip was still playing.
      else if (!rearmed && status.isLoaded && status.duration > 0) {
        rearmed = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(finish, status.duration * 1000 + 1500);
      }
    });
    function finish() {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      sub.remove();
      finishCurrent = null;
      resolve();
    }
    finishCurrent = finish;
    try {
      p.replace(uri);
      p.play();
    } catch {
      finish();
      return;
    }
    timer = setTimeout(finish, maxWaitMs);
  });
}

// How long to wait for a clip that isn't cached yet. A first-ever synthesis
// measured 20-35s. Falling back to the device voice instead would read the
// *English* text on most phones (no Urdu/Punjabi/Pashto/Sindhi voice), so a
// patient who chose a language only ever hears that language; the flow's
// clips are prefetched up front so this wait is rare.
const CLIP_WAIT_MS = 60000;

let deviceVoices: Promise<string[]> | null = null;
function deviceVoiceLangs() {
  deviceVoices ??= Speech.getAvailableVoicesAsync()
    .then((vs) => vs.map((v) => (v.language || "").toLowerCase()))
    .catch(() => []);
  return deviceVoices;
}

// Resolves once the prompt has finished speaking (with a timeout fallback),
// so callers can start listening only after it - listening during the
// prompt captured the prompt instead of the patient.
export async function speakPrompt(lang: string, key: string, { maxWaitMs = 4000 } = {}) {
  const myTurn = ++turn;
  const superseded = () => myTurn !== turn;
  stopCurrent();
  if (lang !== "en") {
    let uri: string | null = null;
    try {
      uri = await Promise.race([
        clipUri(lang, key),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("slow")), CLIP_WAIT_MS)),
      ]);
    } catch {}
    if (superseded()) return;
    if (uri) {
      // Again right before playing - something may have started while this
      // clip was loading.
      stopCurrent();
      // Native-language clips run longer than the English wording the
      // default timeouts were tuned for.
      return playClip(uri, Math.max(maxWaitMs * 2.5, 10000));
    }
  }
  try {
    const { strings } = await loadPrompts(lang);
    if (superseded() || !strings[key]) return;
    const voiceLang = DEVICE_VOICE[lang] || lang;
    const hasVoice = lang === "en" || (await deviceVoiceLangs()).some((l) => l.startsWith(voiceLang));
    // No voice for the language: stay silent rather than switch to English
    // - the same text is on screen.
    if (!hasVoice || superseded()) return;
    stopCurrent();
    return await deviceSpeak(strings[key], voiceLang, maxWaitMs);
  } catch {}
}

// Fire-and-forget variant for prompts nothing waits on.
export function say(lang: string, key: string) {
  speakPrompt(lang, key).catch(() => {});
}

// Reads a number back digit by digit ("zero three zero zero...") in the
// patient's language, from ten cached per-digit clips rather than a fresh
// synthesis for every distinct phone number or token.
export async function speakDigits(lang: string, digits: string | number) {
  const clean = String(digits).replace(/\D/g, "");
  if (lang === "en") {
    stopCurrent();
    return deviceSpeak(clean.split("").join(" "), "en", 600 * clean.length + 1000);
  }
  const started = epoch;
  for (const d of clean) {
    if (epoch !== started) return;
    await speakPrompt(lang, `digit_${d}`, { maxWaitMs: 1500 });
  }
}

export const DIGIT_KEYS = Array.from({ length: 10 }, (_, d) => `digit_${d}`);
