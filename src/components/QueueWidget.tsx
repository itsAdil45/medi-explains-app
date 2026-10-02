import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useIsFocused } from "expo-router";
import { Ticket, X } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { DIGIT_KEYS, prefetchPrompts, speakDigits, speakPrompt } from "@/voice/speech";

const REFRESH_MS = 10000;

// "Token number 12. It's your turn..." in the patient's language. The
// doctor's name is left out of the spoken version - it would be read with an
// English voice mid-sentence - but stays in the notification and card.
async function announceTurn(lang: string, token: string | number) {
  await speakPrompt(lang, "q_token", { maxWaitMs: 2000 });
  await speakDigits(lang, token);
  await speakPrompt(lang, "q_your_turn");
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function QueueWidget() {
  const { user } = useAuth();

  const isPatient = user?.role === "patient";
  const lang = user?.preferred_language || "en";
  // Rendered on more than one screen (Dashboard, and a consultation pushed on
  // top of it) - only the one in front announces, or the turn is called out
  // and notified twice.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  const [entry, setEntry] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  const lastCalledIdRef = useRef<string | number | null>(null);

  const notify = useCallback(async (title: string, body: string) => {
    try {
      const permissions = await Notifications.getPermissionsAsync();

      let finalStatus = permissions.status;

      if (finalStatus !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();

        finalStatus = requested.status;
      }

      if (finalStatus !== "granted") {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
        },
        trigger: null,
      });
    } catch {}
  }, []);

  const poll = useCallback(async () => {
    if (!isPatient) return;

    try {
      const data = await api.myQueueStatus();

      setEntry(data);

      if (
        data &&
        data.status === "called" &&
        lastCalledIdRef.current !== data.id
      ) {
        lastCalledIdRef.current = data.id;

        setDismissed(false);

        if (!focusedRef.current) return;

        const notificationBody = `Token #${data.token_number} — please go to ${data.doctor_name}'s room.`;

        await notify("🎟️ Your turn", notificationBody);

        announceTurn(lang, data.token_number).catch(() => {});
      }
    } catch {}
  }, [isPatient, notify, lang]);

  // Warm the call-out while still waiting, so it plays the moment they're called.
  const waiting = Boolean(entry && entry.status !== "called");
  useEffect(() => {
    if (waiting) prefetchPrompts(lang, ["q_token", "q_your_turn", ...DIGIT_KEYS]);
  }, [waiting, lang]);

  useEffect(() => {
    if (!isPatient) return;

    poll();

    const timer = setInterval(poll, REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isPatient, poll]);

  if (!isPatient || !entry || dismissed) {
    return null;
  }

  const called = entry.status === "called";

  return (
    <View className="absolute top-10 right-20 z-50">
      <View
        className={`rounded-xl border p-4 shadow-lg ${
          called ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
        }`}
      >
        {/* Header */}
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 flex-row items-center gap-2">
            <Ticket size={18} color={called ? "#b45309" : "#64748b"} />

            <Text className="flex-1 text-sm font-semibold text-slate-900">
              {called ? "It's your turn!" : "You are in the queue"}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Dismiss"
            onPress={() => setDismissed(true)}
            className="h-7 w-7 items-center justify-center rounded active:bg-slate-100"
          >
            <X size={15} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Token */}
        <Text className="mt-2 text-sm text-slate-600">
          Token <Text className="font-bold">#{entry.token_number}</Text>
          {" · "}
          {entry.doctor_name}
        </Text>

        {/* Status */}
        {called ? (
          <Text className="mt-1.5 text-xs font-medium text-amber-800">
            Please head to the doctor's room now.
          </Text>
        ) : (
          <Text className="mt-1.5 text-xs text-slate-500">
            {entry.position
              ? `${entry.position} patient${
                  entry.position === 1 ? "" : "s"
                } ahead of you.`
              : "Waiting to be called."}
          </Text>
        )}
      </View>
    </View>
  );
}
