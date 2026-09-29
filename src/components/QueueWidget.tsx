import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { Ticket, X } from "lucide-react-native";

import { api } from "@/api/client";
import { useAuth } from "@/api/auth";

const REFRESH_MS = 10000;

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

  const [entry, setEntry] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  const lastCalledIdRef = useRef<string | number | null>(null);

  const speak = useCallback((text: string) => {
    Speech.stop();

    Speech.speak(text, {
      language: "en-US",
      rate: 0.9,
      pitch: 1,
    });
  }, []);

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

        const notificationBody = `Token #${data.token_number} — please go to ${data.doctor_name}'s room.`;

        const speechText = `Token number ${data.token_number}. It's your turn. Please go to ${data.doctor_name}'s room now.`;

        await notify("🎟️ Your turn", notificationBody);

        speak(speechText);
      }
    } catch {}
  }, [isPatient, notify, speak]);

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
