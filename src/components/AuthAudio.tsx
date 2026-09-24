import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from "expo-audio";
import type { File } from "expo-file-system";
import { Play, Pause } from "lucide-react-native";

import { downloadAuthedFile } from "@/api/download";

// The web version fetched the audio with an Authorization header and played
// the resulting blob URL, because <audio> can't send headers. Same idea here:
// download the audio to the app cache with the token, then play the local
// file. (expo-audio's AudioSource does accept `headers`, but there's an open
// report of them being ignored on iOS - expo/expo#37044 - and a local file
// also avoids re-downloading on every seek/replay.)

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function AuthAudio({ url }: { url: string }) {
  // Keyed by url so a new url reads as "loading" again without resetting state
  // inside the effect: anything whose url !== the current one is stale.
  const [result, setResult] = useState<{ url: string; error: string | null } | null>(null);
  const current = result?.url === url ? result : null;
  const ready = current !== null && current.error === null;
  const error = current?.error ?? null;

  // Declared BEFORE useAudioPlayer on purpose: unmount cleanups run in
  // declaration order, so this pauses the player before the hook releases it.
  // On SDK 57 a released player can otherwise keep playing (expo/expo#47569),
  // i.e. the summary would keep talking after the patient leaves the screen.
  const playerRef = useRef<AudioPlayer | null>(null);
  useEffect(
    () => () => {
      try {
        playerRef.current?.pause();
      } catch {
        // already released
      }
    },
    [],
  );

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    let file: File | null = null;
    const controller = new AbortController();

    downloadAuthedFile(url, `audio_${Date.now()}`, ".mp3", { signal: controller.signal })
      .then((f) => {
        if (cancelled) {
          f.delete();
          return;
        }
        file = f;
        player.replace(f.uri);
        setResult({ url, error: null });
      })
      .catch((e: any) => {
        if (!cancelled && e?.name !== "AbortError") setResult({ url, error: String(e?.message || e) });
      });

    return () => {
      cancelled = true;
      controller.abort();
      try {
        file?.delete();
      } catch {
        // cache files get purged by the OS anyway
      }
    };
  }, [url, player]);

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // expo-audio leaves the player parked at the end after it finishes, so
    // "play" again has to rewind first.
    const atEnd = status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1);
    if (atEnd) await player.seekTo(0);
    player.play();
  }

  const failure = error || status.error;
  if (failure) {
    return (
      <View className="rounded-lg bg-red-50 px-3 py-2.5">
        <Text className="text-xs font-medium text-red-700">Audio failed: {failure}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View className="flex-row items-center gap-2 py-1">
        <ActivityIndicator size="small" />
        <Text className="text-xs text-slate-500">Loading audio…</Text>
      </View>
    );
  }

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View className="flex-row items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause summary audio" : "Play summary audio"}
        className="size-10 items-center justify-center rounded-full bg-[#4ab96a]"
      >
        {status.playing ? (
          <Pause size={18} color="#fff" fill="#fff" />
        ) : (
          <Play size={18} color="#fff" fill="#fff" />
        )}
      </Pressable>
      <View className="flex-1 gap-1">
        <View className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <View className="h-full rounded-full bg-[#4ab96a]" style={{ width: `${progress * 100}%` }} />
        </View>
        <Text className="text-[11px] text-slate-500">
          {formatTime(status.currentTime)} / {formatTime(status.duration)}
        </Text>
      </View>
    </View>
  );
}
