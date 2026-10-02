import { Platform } from "react-native";
import type { AudioRecorder } from "expo-audio";

// End-of-speech detection for a recorded question: watches the mic level
// and calls onEnd once the speaker has talked and then gone quiet, instead
// of cutting them off at a fixed deadline. Purely an energy threshold
// against a tracked noise floor - no model, no server round-trip. Same
// tuning as the website's src/voice/endOfSpeech.js; the level comes from
// the recorder's metering here (needs isMeteringEnabled) instead of Web
// Audio.

// Silence after speech that ends the question. Long enough for the natural
// mid-sentence pause of an older patient ("what did... the doctor give
// me"), short enough that the answer doesn't feel slow to start.
const SILENCE_MS = 1500;
// Sustained loudness that counts as the speaker having started - shorter
// blips (a cough, a tap on the phone, a door) don't. Dips shorter than
// SPEECH_GAP_MS - between syllables of a soft voice - don't restart it.
const SPEECH_START_MS = 200;
const SPEECH_GAP_MS = 120;
// Nobody ever crossed the threshold - a very quiet voice or a noisy room
// the floor tracking couldn't separate. Ends like the old fixed window did,
// so the recording still goes to transcription rather than being dropped.
const NO_SPEECH_MS = 10000;
// Hard cap however long someone keeps talking.
const MAX_MS = 30000;
// The start beep plays through the speaker right as recording starts;
// ignore the mic until it has died away.
const IGNORE_START_MS = 300;

const POLL_MS = 50;
// RMS on a 0..1 scale. Speech sits well above MIN, room noise below it;
// the floor multiple adapts to a louder room, capped so a noisy one can't
// make speech undetectable.
const MIN_THRESHOLD = 0.01;
const MAX_THRESHOLD = 0.06;
const FLOOR_MULTIPLE = 3;
// Speech has to drop further than it rose to count as silence, so a voice
// hovering near the threshold doesn't flicker between the two.
const RELEASE_RATIO = 0.7;
// Android meters the *peak* amplitude since the last read, iOS the average
// power - for speech the peak runs roughly 3x the RMS the thresholds above
// are tuned for.
const PEAK_TO_RMS = Platform.OS === "android" ? 3 : 1;

export type EndReason = "silence" | "no_speech" | "max";

// The detector itself: feed it a level (RMS, 0..1) every POLL_MS.
export function createEndOfSpeechDetector(onEnd: (reason: EndReason) => void) {
  const startedAt = Date.now();
  let floor: number | null = null;
  let loudSince: number | null = null;
  let lastLoud: number | null = null;
  let quietSince: number | null = null;
  let speaking = false;
  let heardSpeech = false;
  let done = false;

  function finish(reason: EndReason) {
    if (done) return;
    done = true;
    onEnd(reason);
  }

  function push(level: number | null) {
    if (done) return;
    const now = Date.now();
    const elapsed = now - startedAt;
    if (elapsed >= MAX_MS) return finish("max");
    if (!heardSpeech && elapsed >= NO_SPEECH_MS) return finish("no_speech");
    if (elapsed < IGNORE_START_MS || level === null) return;

    if (floor === null) floor = level;
    const threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, floor * FLOOR_MULTIPLE));

    if (!speaking) {
      // Drops straight to a quieter reading, rises slowly and only on
      // readings that aren't speech - so the floor follows the room, not
      // a soft voice that would otherwise drag the threshold up past it.
      if (level < floor) floor = level;
      else if (level <= threshold) floor = floor * 0.95 + level * 0.05;
      if (level > threshold) {
        loudSince ??= now;
        lastLoud = now;
        if (now - loudSince >= SPEECH_START_MS) {
          speaking = true;
          heardSpeech = true;
          quietSince = null;
        }
      } else if (loudSince !== null && lastLoud !== null && now - lastLoud > SPEECH_GAP_MS) {
        loudSince = null;
      }
      // A pause before speaking again keeps counting as silence.
      if (heardSpeech && quietSince !== null && now - quietSince >= SILENCE_MS) finish("silence");
      return;
    }

    if (level < threshold * RELEASE_RATIO) {
      quietSince ??= now;
      speaking = false;
      loudSince = null;
    }
  }

  return {
    push,
    cancel() {
      done = true;
    },
  };
}

// Watches a recording expo-audio recorder. onEnd fires once; returns a
// cancel function - call it when the recording is stopped some other way
// (a tap, unmount).
export function watchRecorderForEndOfSpeech(recorder: AudioRecorder, onEnd: (reason: EndReason) => void) {
  const detector = createEndOfSpeechDetector((reason) => {
    clearInterval(timer);
    onEnd(reason);
  });
  const timer = setInterval(() => {
    let db: number | undefined;
    try {
      db = recorder.getStatus().metering;
    } catch {
      // Recorder released under us - the caller's cancel follows.
    }
    // No metering on this device: the detector still ends the recording
    // through its no-speech / max timeouts.
    detector.push(typeof db === "number" ? Math.pow(10, db / 20) / PEAK_TO_RMS : null);
  }, POLL_MS);
  return () => {
    clearInterval(timer);
    detector.cancel();
  };
}
