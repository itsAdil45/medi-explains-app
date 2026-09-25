import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, AppState, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";
import type { File } from "expo-file-system";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { downloadAuthedFile } from "@/api/download";

const REFRESH_MS = 30000;
const MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;
// Medicines due within the same minute become one reminder session.
const SAME_TIME_WINDOW_MS = 60000;
// Repeat normal alarm until patient responds.
const ALARM_REPEAT_MS = 4000;
// Pause before repeating the complete voice sequence.
const VOICE_REPEAT_DELAY_MS = 12000;
// Pause between medicine 1, medicine 2, etc.
const BETWEEN_MEDICINES_MS = 1400;
// Slightly slower speech for accessibility.
const VOICE_PLAYBACK_RATE = 0.86;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Persisted so the widget doesn't forget the patient's choice and re-run the
// enable/permission flow on every app launch. AsyncStorage is async (unlike
// the website's synchronous localStorage), so these read as a hook-driven
// effect below rather than a lazy useState initializer.
const AS_ALARM = "mxp_med_alarm_enabled";
const AS_VOICE = "mxp_med_voice_enabled";
const AS_COLLAPSED = "mxp_med_widget_collapsed";

type Reminder = { schedule: any; event: any; dueAt: string; dueMs: number };
type Active = { reminders: Reminder[]; dueAt: string };

function effectiveDue(event: any) {
  if (event.status === "snoozed" && event.snoozed_until) return event.snoozed_until;
  return event.scheduled_at;
}

function formatDate(value: string) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(value: string) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function reminderDescription(reminder: Reminder) {
  const { schedule, dueAt } = reminder;
  const parts = [
    schedule.medication_name ? `Medicine: ${schedule.medication_name}` : null,
    schedule.dose ? `Dose: ${schedule.dose}` : null,
    dueAt ? `${formatDate(dueAt)} at ${formatTime(dueAt)}` : null,
    schedule.frequency ? `Frequency: ${schedule.frequency}` : null,
    schedule.timing ? `Timing: ${schedule.timing}` : null,
    schedule.food_instruction ? `Food: ${schedule.food_instruction}` : null,
    schedule.duration ? `Duration: ${schedule.duration}` : null,
  ];
  return parts.filter(Boolean).join(" \u00b7 ");
}

let notificationHandlerSet = false;
function ensureNotificationHandler() {
  if (notificationHandlerSet) return;
  notificationHandlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("medication-reminders", {
      name: "Medication reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    }).catch(() => {});
  }
}

export default function MedicationAlarmManager() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [alarmEnabled, setAlarmEnabledState] = useState(false);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  // Collapsed to a small badge once configured, so the widget stops
  // covering screen content - never fully hidden, since these are
  // medication-safety reminders, just tucked out of the way.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([AS_ALARM, AS_VOICE, AS_COLLAPSED]).then((pairs) => {
      const vals = Object.fromEntries(pairs);
      if (vals[AS_ALARM] != null) setAlarmEnabledState(vals[AS_ALARM] === "true");
      if (vals[AS_VOICE] != null) setVoiceEnabledState(vals[AS_VOICE] === "true");
      if (vals[AS_COLLAPSED] != null) setCollapsed(vals[AS_COLLAPSED] === "true");
    });
  }, []);

  function setAlarmEnabled(v: boolean) {
    setAlarmEnabledState(v);
    AsyncStorage.setItem(AS_ALARM, String(v)).catch(() => {});
  }
  function setVoiceEnabled(v: boolean) {
    setVoiceEnabledState(v);
    AsyncStorage.setItem(AS_VOICE, String(v)).catch(() => {});
  }
  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    AsyncStorage.setItem(AS_COLLAPSED, String(v)).catch(() => {});
  }

  const [schedules, setSchedules] = useState<any[]>([]);
  const [active, setActive] = useState<Active | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alarmPlayerRef = useRef<AudioPlayer | null>(null);
  const voicePlayerRef = useRef<AudioPlayer | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alarmLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRepeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSequenceTokenRef = useRef(0);
  const voiceFileCacheRef = useRef<Map<string, File>>(new Map());
  // Prevent the same exact event/due-time from firing more than once. Snooze
  // creates a different due time, so it may correctly fire again.
  const firedRef = useRef<Set<string>>(new Set());

  const isPatient = user?.role === "patient";
  const remindersEnabled = alarmEnabled || voiceEnabled;

  function getAlarmPlayer() {
    if (!alarmPlayerRef.current) {
      alarmPlayerRef.current = createAudioPlayer(require("@/assets/sounds/alarm-tone.wav"));
    }
    return alarmPlayerRef.current;
  }

  function getVoicePlayer() {
    if (!voicePlayerRef.current) {
      voicePlayerRef.current = createAudioPlayer(null);
    }
    return voicePlayerRef.current;
  }

  // =======================================================
  // LOAD PATIENT SCHEDULES
  // =======================================================

  const loadSchedules = useCallback(async () => {
    if (!isPatient) return [];
    try {
      const data = (await api.mySchedules()) || [];
      setSchedules(data);
      setError(null);
      return data;
    } catch (e: any) {
      setError(e.message);
      return [];
    }
  }, [isPatient]);

  // =======================================================
  // NORMAL ALARM
  // =======================================================

  async function playAlarmBurst() {
    ensureNotificationHandler();
    const player = getAlarmPlayer();
    try {
      await player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn("Alarm error:", e);
    }
  }

  function stopAlarmLoop() {
    if (alarmLoopRef.current) {
      clearInterval(alarmLoopRef.current);
      alarmLoopRef.current = null;
    }
  }

  async function startAlarmLoop() {
    stopAlarmLoop();
    await playAlarmBurst();
    alarmLoopRef.current = setInterval(playAlarmBurst, ALARM_REPEAT_MS);
  }

  // =======================================================
  // VOICE AUDIO
  // =======================================================

  function stopVoice() {
    try {
      voicePlayerRef.current?.pause();
    } catch {}
  }

  function stopVoiceLoop() {
    voiceSequenceTokenRef.current += 1;
    if (voiceRepeatTimerRef.current) {
      clearTimeout(voiceRepeatTimerRef.current);
      voiceRepeatTimerRef.current = null;
    }
    stopVoice();
  }

  async function loadVoiceFile(eventId: string) {
    const cached = voiceFileCacheRef.current.get(eventId);
    if (cached) return cached;
    const file = await downloadAuthedFile(api.medicationEventAudioUrl(eventId), `med_voice_${eventId}`, ".mp3");
    voiceFileCacheRef.current.set(eventId, file);
    return file;
  }

  async function preloadVoice(eventId: string) {
    if (!voiceEnabled) return;
    try {
      await loadVoiceFile(eventId);
    } catch (e) {
      console.warn("Voice preload failed:", e);
    }
  }

  function playVoice(eventId: string) {
    return loadVoiceFile(eventId).then(
      (file) =>
        new Promise<void>((resolve, reject) => {
          const player = getVoicePlayer();
          const sub = player.addListener("playbackStatusUpdate", (status: any) => {
            if (status.didJustFinish) {
              sub.remove();
              resolve();
            }
          });
          try {
            player.replace(file.uri);
            // Not confirmed on this SDK - wrapped defensively so a naming
            // mismatch just plays at normal speed instead of throwing.
            try {
              (player as any).setPlaybackRate?.(VOICE_PLAYBACK_RATE);
            } catch {}
            player.play();
          } catch (e) {
            sub.remove();
            reject(e);
          }
        }),
    );
  }

  async function playVoiceSequence(reminders: Reminder[], token: number) {
    for (let i = 0; i < reminders.length; i++) {
      if (token !== voiceSequenceTokenRef.current || !voiceEnabled) return;
      try {
        await playVoice(reminders[i].event.id);
      } catch (e) {
        console.warn("Voice reminder error:", e);
      }
      if (i < reminders.length - 1) await sleep(BETWEEN_MEDICINES_MS);
    }
  }

  function startVoiceLoop(reminders: Reminder[]) {
    stopVoiceLoop();
    const token = voiceSequenceTokenRef.current;
    const firstDelay = alarmEnabled ? 1200 : 200;

    async function runSequence() {
      if (token !== voiceSequenceTokenRef.current || !voiceEnabled) return;
      await playVoiceSequence(reminders, token);
      if (token !== voiceSequenceTokenRef.current || !voiceEnabled) return;
      voiceRepeatTimerRef.current = setTimeout(runSequence, VOICE_REPEAT_DELAY_MS);
    }

    voiceRepeatTimerRef.current = setTimeout(runSequence, firstDelay);
  }

  // =======================================================
  // GROUP RING
  // =======================================================

  async function ringGroup(reminders: Reminder[]) {
    if (!reminders?.length) return;

    const unfired = reminders.filter((r) => !firedRef.current.has(`${r.event.id}|${r.dueAt}`));
    if (!unfired.length) return;
    for (const r of unfired) firedRef.current.add(`${r.event.id}|${r.dueAt}`);

    const first = unfired[0];
    setActive({ reminders: unfired, dueAt: first.dueAt });

    // OS notification, in case the app isn't the thing on screen right now.
    try {
      ensureNotificationHandler();
      const perm = await Notifications.getPermissionsAsync();
      if (perm.granted) {
        const body =
          unfired.length === 1
            ? reminderDescription(unfired[0])
            : `${unfired.length} medicines are due: ${unfired
                .map((item) => item.schedule.medication_name)
                .filter(Boolean)
                .join(", ")}`;
        await Notifications.scheduleNotificationAsync({
          content: { title: "\ud83d\udc8a Medication reminder", body, sound: true },
          trigger: null,
        });
      }
    } catch {}

    // Normal alarm is independent of voice.
    if (alarmEnabled) await startAlarmLoop();
    // Voice is independent of normal alarm.
    if (voiceEnabled) startVoiceLoop(unfired);
  }

  // =======================================================
  // FIND NEXT EVENT
  // =======================================================

  function scheduleNextAlarm(data = schedules) {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!remindersEnabled || active) return;

    const now = Date.now();
    const candidates: Reminder[] = [];

    for (const schedule of data || []) {
      if (schedule.active === false) continue;
      for (const event of schedule.events || []) {
        if (event.status !== "pending" && event.status !== "snoozed") continue;
        const dueAt = effectiveDue(event);
        const dueMs = new Date(dueAt).getTime();
        if (!Number.isFinite(dueMs)) continue;
        if (now - dueMs > MAX_OVERDUE_MS) continue;
        const key = `${event.id}|${dueAt}`;
        if (firedRef.current.has(key)) continue;
        candidates.push({ schedule, event, dueAt, dueMs });
      }
    }

    if (!candidates.length) return;
    candidates.sort((a, b) => a.dueMs - b.dueMs);
    const first = candidates[0];
    const sameTime = candidates.filter((item) => Math.abs(item.dueMs - first.dueMs) < SAME_TIME_WINDOW_MS);

    // Pre-cache all voices in the upcoming group.
    if (voiceEnabled) sameTime.forEach((item) => preloadVoice(item.event.id));

    const delay = Math.max(0, first.dueMs - Date.now());
    timerRef.current = setTimeout(() => ringGroup(sameTime), delay);
  }

  // =======================================================
  // REFRESH
  // =======================================================

  useEffect(() => {
    if (!isPatient || !remindersEnabled) return;
    let alive = true;

    async function refresh() {
      const data = await loadSchedules();
      if (!alive) return;
      scheduleNextAlarm(data);
    }

    refresh();
    const refreshTimer = setInterval(refresh, REFRESH_MS);
    // Same idea as the website's window "focus" listener - catch up on
    // whatever happened while the app was backgrounded.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => {
      alive = false;
      clearInterval(refreshTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPatient, remindersEnabled, loadSchedules, alarmEnabled, voiceEnabled]);

  useEffect(() => {
    if (remindersEnabled && !active) scheduleNextAlarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, remindersEnabled, active, alarmEnabled, voiceEnabled]);

  // =======================================================
  // ENABLE / DISABLE
  // =======================================================

  async function enableAlarm() {
    setError(null);
    try {
      ensureNotificationHandler();
      await Notifications.requestPermissionsAsync();
      // Audible confirmation.
      await playAlarmBurst();
      setAlarmEnabled(true);
      await loadSchedules();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function disableAlarm() {
    setAlarmEnabled(false);
    stopAlarmLoop();
  }

  async function enableVoice() {
    setError(null);
    try {
      ensureNotificationHandler();
      await Notifications.requestPermissionsAsync();
      setVoiceEnabled(true);
      const data = await loadSchedules();
      const next = (data || [])
        .flatMap((schedule: any) => (schedule.events || []).map((event: any) => ({ schedule, event })))
        .find((item: any) => item.event.status === "pending" || item.event.status === "snoozed");
      if (next) {
        try {
          await loadVoiceFile(next.event.id);
        } catch (e) {
          console.warn("Voice preload failed:", e);
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  function disableVoice() {
    setVoiceEnabled(false);
    stopVoiceLoop();
  }

  // =======================================================
  // TEST BUTTONS
  // =======================================================

  async function testAlarm() {
    setError(null);
    try {
      await playAlarmBurst();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function testVoice() {
    setError(null);
    const schedule = schedules.find((item) => (item.events || []).length);
    const event =
      schedule?.events?.find((item: any) => item.status === "pending" || item.status === "snoozed") ||
      schedule?.events?.[0];
    if (!event) {
      setError("No medication reminder is available to test.");
      return;
    }
    try {
      await playVoice(event.id);
    } catch (e: any) {
      setError(`Voice reminder failed: ${e.message}`);
    }
  }

  // =======================================================
  // EVENT ACTION HELPERS
  // =======================================================

  async function sendAction(eventId: string, actionName: string) {
    if (actionName === "snooze") return api.medicationEventAction(eventId, "snooze", 10);
    return api.medicationEventAction(eventId, actionName);
  }

  async function actionOne(reminder: Reminder, actionName: string) {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendAction(reminder.event.id, actionName);
      const remaining = active.reminders.filter((item) => item.event.id !== reminder.event.id);
      stopVoiceLoop();
      if (remaining.length) {
        setActive({ reminders: remaining, dueAt: active.dueAt });
        if (voiceEnabled) startVoiceLoop(remaining);
      } else {
        stopAlarmLoop();
        setActive(null);
      }
      await loadSchedules();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function actionAll(actionName: string) {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    stopAlarmLoop();
    stopVoiceLoop();
    try {
      for (const reminder of active.reminders) await sendAction(reminder.event.id, actionName);
      setActive(null);
      await loadSchedules();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function repeatAllVoice() {
    if (!active || !voiceEnabled) return;
    stopVoiceLoop();
    const token = voiceSequenceTokenRef.current;
    await playVoiceSequence(active.reminders, token);
  }

  // =======================================================
  // CLEANUP
  // =======================================================

  useEffect(() => {
    return () => {
      stopAlarmLoop();
      stopVoiceLoop();
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        alarmPlayerRef.current?.remove();
      } catch {}
      try {
        voicePlayerRef.current?.remove();
      } catch {}
    };
  }, []);

  if (!isPatient) return null;

  // =======================================================
  // UI
  // =======================================================

  return (
    <>
      {collapsed ? (
        <Pressable
          onPress={() => setCollapsedPersist(false)}
          accessibilityLabel="Show medication reminders"
          style={{ position: "absolute", right: 18, bottom: insets.bottom + 18 }}
          className="size-[54px] items-center justify-center rounded-full bg-white shadow-lg"
        >
          <Text className="text-2xl">{"\ud83d\udc8a"}</Text>
          {(alarmEnabled || voiceEnabled) && (
            <View className="absolute right-1 top-1 size-3 rounded-full border-2 border-white bg-emerald-500" />
          )}
        </Pressable>
      ) : (
        <View
          style={{ position: "absolute", right: 18, bottom: insets.bottom + 18, width: 340 }}
          className="rounded-2xl bg-white p-3.5 shadow-lg"
        >
          <View className="flex-row items-start justify-between gap-2">
            <Text className="text-base font-bold text-slate-900">{"\ud83d\udc8a"} Medication reminders</Text>
            <Pressable
              onPress={() => setCollapsedPersist(true)}
              accessibilityLabel="Minimize"
              className="size-9 items-center justify-center rounded-lg bg-slate-100"
            >
              <Text className="text-sm text-slate-600">{"\u2715"}</Text>
            </Pressable>
          </View>

          <Text className="my-2 text-xs text-slate-500">
            Alarm and voice can be switched on or off independently.
          </Text>

          <View className="mb-2.5 flex-row items-center justify-between gap-2.5">
            <View className="flex-1">
              <Text className="text-sm font-bold text-slate-900">{"\ud83d\udd14"} Alarm</Text>
              <Text className="text-xs text-slate-500">Repeats until the reminder is handled.</Text>
            </View>
            {alarmEnabled ? (
              <Pressable onPress={disableAlarm} className="rounded-lg bg-slate-100 px-3 py-2">
                <Text className="text-xs font-semibold text-slate-700">ON {"\u2713"}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={enableAlarm} className="rounded-lg bg-[#4ab96a] px-3 py-2">
                <Text className="text-xs font-semibold text-white">Enable</Text>
              </Pressable>
            )}
          </View>

          <View className="flex-row items-center justify-between gap-2.5">
            <View className="flex-1">
              <Text className="text-sm font-bold text-slate-900">{"\ud83d\udde3\ufe0f"} Voice</Text>
              <Text className="text-xs text-slate-500">Speaks each due medicine slowly and separately.</Text>
            </View>
            {voiceEnabled ? (
              <Pressable onPress={disableVoice} className="rounded-lg bg-slate-100 px-3 py-2">
                <Text className="text-xs font-semibold text-slate-700">ON {"\u2713"}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={enableVoice} className="rounded-lg bg-[#4ab96a] px-3 py-2">
                <Text className="text-xs font-semibold text-white">Enable</Text>
              </Pressable>
            )}
          </View>

          {(alarmEnabled || voiceEnabled) && (
            <View className="mt-3 rounded-lg bg-sky-50 px-3 py-2">
              <Text className="text-xs text-sky-900">
                Reminders active. {alarmEnabled ? "Alarm ON. " : "Alarm OFF. "}
                {voiceEnabled ? "Voice ON." : "Voice OFF."}
              </Text>
            </View>
          )}

          <View className="mt-2.5 flex-row flex-wrap gap-1.5">
            <Pressable onPress={testAlarm} className="rounded-lg bg-slate-100 px-3 py-2">
              <Text className="text-xs font-semibold text-slate-700">{"\ud83d\udd14"} Test alarm</Text>
            </Pressable>
            <Pressable
              onPress={testVoice}
              disabled={!voiceEnabled}
              className={`rounded-lg bg-slate-100 px-3 py-2 ${!voiceEnabled ? "opacity-50" : ""}`}
            >
              <Text className="text-xs font-semibold text-slate-700">{"\ud83d\udde3\ufe0f"} Test voice</Text>
            </Pressable>
          </View>

          {error && <Text className="mt-2 text-xs font-medium text-red-600">{error}</Text>}
        </View>
      )}

      {/* FULL SCREEN REMINDER */}
      <Modal visible={!!active} animationType="fade" transparent statusBarTranslucent>
        <View className="flex-1 items-center justify-center bg-black/70 p-5">
          <ScrollView className="max-h-[92%] w-full max-w-[440px] rounded-2xl bg-white" contentContainerClassName="p-6">
            <Text className="text-center text-5xl">{"\ud83d\udc8a"}</Text>
            <Text className="mt-2 text-center text-lg font-bold text-slate-900">Medication Reminder</Text>

            {active && (
              <>
                <Text className="mb-4 mt-2 text-center text-sm text-slate-700">
                  <Text className="font-bold">Date: </Text>
                  {formatDate(active.dueAt)} {"\u00b7 "}
                  <Text className="font-bold">Time: </Text>
                  {formatTime(active.dueAt)}
                </Text>

                {active.reminders.length > 1 && (
                  <View className="mb-4 rounded-lg bg-sky-50 px-3 py-2.5">
                    <Text className="text-center text-xs text-sky-900">
                      {active.reminders.length} medicines are due now. They are shown and spoken one at a time.
                    </Text>
                  </View>
                )}

                <View className="gap-3.5">
                  {active.reminders.map((reminder, index) => {
                    const s = reminder.schedule;
                    return (
                      <View key={reminder.event.id} className="rounded-xl border border-slate-200 p-4">
                        <Text className="mb-2 text-sm font-bold text-slate-900">
                          {active.reminders.length > 1 ? `Medicine ${index + 1}: ` : ""}
                          {s.medication_name}
                        </Text>
                        <View className="gap-1">
                          <Text className="text-sm text-slate-800">
                            <Text className="font-bold">Dose / quantity: </Text>
                            {s.dose || s.strength || "\u2014"}
                          </Text>
                          {s.frequency && (
                            <Text className="text-sm text-slate-800">
                              <Text className="font-bold">Frequency: </Text>
                              {s.frequency}
                            </Text>
                          )}
                          {s.timing && (
                            <Text className="text-sm text-slate-800">
                              <Text className="font-bold">Timing: </Text>
                              {s.timing}
                            </Text>
                          )}
                          {s.food_instruction && (
                            <Text className="text-sm text-slate-800">
                              <Text className="font-bold">Food: </Text>
                              {s.food_instruction}
                            </Text>
                          )}
                          {s.duration && (
                            <Text className="text-sm text-slate-800">
                              <Text className="font-bold">Duration: </Text>
                              {s.duration}
                            </Text>
                          )}
                          {s.route && (
                            <Text className="text-sm text-slate-800">
                              <Text className="font-bold">Route: </Text>
                              {s.route}
                            </Text>
                          )}
                          <Text className="text-sm text-slate-800">
                            <Text className="font-bold">Reminder time: </Text>
                            {formatTime(reminder.dueAt)}
                          </Text>
                        </View>

                        <View className="mt-3 flex-row flex-wrap gap-2">
                          <Pressable
                            disabled={busy}
                            onPress={() => actionOne(reminder, "taken")}
                            className={`rounded-lg bg-[#4ab96a] px-3 py-2 ${busy ? "opacity-50" : ""}`}
                          >
                            <Text className="text-xs font-semibold text-white">{"\u2713"} Taken</Text>
                          </Pressable>
                          <Pressable
                            disabled={busy}
                            onPress={() => actionOne(reminder, "snooze")}
                            className={`rounded-lg bg-slate-100 px-3 py-2 ${busy ? "opacity-50" : ""}`}
                          >
                            <Text className="text-xs font-semibold text-slate-700">{"\u23f0"} Snooze 10 min</Text>
                          </Pressable>
                          <Pressable
                            disabled={busy}
                            onPress={() => actionOne(reminder, "skip")}
                            className={`rounded-lg bg-slate-100 px-3 py-2 ${busy ? "opacity-50" : ""}`}
                          >
                            <Text className="text-xs font-semibold text-slate-700">Skip</Text>
                          </Pressable>
                          {voiceEnabled && (
                            <Pressable
                              disabled={busy}
                              onPress={() => playVoice(reminder.event.id)}
                              className={`rounded-lg bg-slate-100 px-3 py-2 ${busy ? "opacity-50" : ""}`}
                            >
                              <Text className="text-xs font-semibold text-slate-700">
                                {"\ud83d\udde3\ufe0f"} Repeat this medicine
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {active.reminders.length > 1 && (
                  <>
                    <View className="my-5 h-px bg-slate-200" />
                    <Text className="text-center text-sm font-bold text-slate-900">
                      Actions for all due medicines
                    </Text>
                    <View className="mt-3 flex-row flex-wrap justify-center gap-2.5">
                      <Pressable
                        disabled={busy}
                        onPress={() => actionAll("taken")}
                        className={`rounded-lg bg-[#4ab96a] px-4 py-2.5 ${busy ? "opacity-50" : ""}`}
                      >
                        <Text className="text-xs font-semibold text-white">{"\u2713"} Taken all</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => actionAll("snooze")}
                        className={`rounded-lg bg-slate-100 px-4 py-2.5 ${busy ? "opacity-50" : ""}`}
                      >
                        <Text className="text-xs font-semibold text-slate-700">{"\u23f0"} Snooze all 10 min</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => actionAll("skip")}
                        className={`rounded-lg bg-slate-100 px-4 py-2.5 ${busy ? "opacity-50" : ""}`}
                      >
                        <Text className="text-xs font-semibold text-slate-700">Skip all</Text>
                      </Pressable>
                    </View>
                  </>
                )}

                {voiceEnabled && (
                  <Pressable
                    disabled={busy}
                    onPress={repeatAllVoice}
                    className={`mt-4 items-center rounded-lg bg-slate-100 px-4 py-2.5 ${busy ? "opacity-50" : ""}`}
                  >
                    <Text className="text-xs font-semibold text-slate-700">
                      {"\ud83d\udde3\ufe0f"} Repeat all medicines
                    </Text>
                  </Pressable>
                )}

                <Text className="mt-4 text-center text-xs text-slate-500">
                  Snooze stops that medicine's current reminder and schedules it again for 10 minutes later.
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
