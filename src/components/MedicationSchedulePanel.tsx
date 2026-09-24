import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";

import { api } from "@/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";

type ScheduleEvent = {
  id: string | number;
  status: "pending" | "taken" | "snoozed" | "skipped" | string;
  scheduled_at?: string | null;
  snoozed_until?: string | null;
};

type Schedule = {
  id: string | number;
  medication_name: string;
  dose?: string;
  dosage_form?: string;
  frequency?: string;
  timing?: string;
  food_instruction?: string;
  duration?: string;
  start_date?: string;
  end_date?: string;
  instructions?: string;
  events: ScheduleEvent[];
};

const STATUS_TONE: Record<string, BadgeTone> = {
  taken: "green",
  snoozed: "amber",
  skipped: "slate",
};

function statusText(status: string) {
  if (status === "taken") return "\u2713 Taken";
  if (status === "snoozed") return "\u23F0 Snoozed";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function formatWhen(value?: string | null) {
  if (!value) return "\u2014";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Two per row on a phone (the web grid went to three columns from `sm` up).
function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <View className="w-1/2 pr-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="text-sm text-slate-800">{value || "\u2014"}</Text>
    </View>
  );
}

export default function MedicationSchedulePanel({ consultationId }: { consultationId: string | number }) {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // `active` guards against a slow response landing after unmount or after
    // consultationId changed.
    let active = true;
    api
      .schedulesForConsultation(String(consultationId))
      .then((data: Schedule[]) => {
        if (!active) return;
        setItems(data);
        setErr(null);
      })
      .catch((e: any) => active && setErr(e.message))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [consultationId]);

  async function action(id: string | number, act: "taken" | "snooze" | "skip") {
    setBusy(`${id}-${act}`);
    setErr(null);
    try {
      await api.medicationEventAction(String(id), act, act === "snooze" ? 10 : undefined);
      setItems(await api.schedulesForConsultation(String(consultationId)));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return (
      <View className="flex-row items-center gap-2 py-1">
        <ActivityIndicator size="small" />
        <Text className="text-xs text-slate-500">Loading timetable…</Text>
      </View>
    );
  }

  // Same as the web version, a failed load replaces the panel. A failed
  // action (snooze/taken/skip) keeps the list and shows the error above it,
  // so a flaky connection doesn't make the whole timetable vanish.
  if (err && !items.length) return <Text className="text-xs font-medium text-red-600">{err}</Text>;

  if (!items.length) {
    return <Text className="text-xs text-slate-500">No automatic medication timetable was created.</Text>;
  }

  return (
    <View className="gap-4">
      <View className="rounded-lg bg-sky-50 px-4 py-3">
        <Text className="text-[13px] leading-5 text-sky-900">
          <Text className="font-bold">Medication reminder schedule.</Text> The alarm system uses the exact
          doctor-approved medication instructions shown below.
        </Text>
      </View>

      {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}

      {items.map((schedule) => (
        <Card key={schedule.id}>
          <CardHeader>
            <CardTitle>{`\u{1F48A} ${schedule.medication_name}`}</CardTitle>
          </CardHeader>
          <CardContent className="gap-5">
            <View className="flex-row flex-wrap gap-y-3">
              <InfoField label="Dose / quantity" value={schedule.dose} />
              <InfoField label="Dosage form" value={schedule.dosage_form} />
              <InfoField label="Frequency" value={schedule.frequency} />
              <InfoField label="Timing" value={schedule.timing} />
              <InfoField label="Food instruction" value={schedule.food_instruction} />
              <InfoField label="Duration" value={schedule.duration} />
              <InfoField label="Start date" value={schedule.start_date} />
              <InfoField label="End date" value={schedule.end_date} />
            </View>

            {schedule.instructions ? (
              <Text className="text-xs leading-4 text-slate-500">
                <Text className="font-bold text-slate-700">Doctor-approved instructions:</Text>{" "}
                {schedule.instructions}
              </Text>
            ) : null}

            <View>
              <Text className="mb-2 text-[13px] font-bold text-slate-900">Reminder dates and times</Text>
              <View className="gap-2">
                {schedule.events.map((event) => {
                  const snoozedTo = event.status === "snoozed" && event.snoozed_until ? event.snoozed_until : null;
                  const actionable = event.status === "pending" || event.status === "snoozed";
                  return (
                    <View key={event.id} className="gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3">
                      <View>
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-sm font-semibold text-slate-800">
                            {formatWhen(event.scheduled_at)}
                          </Text>
                          <Badge tone={STATUS_TONE[event.status] || "amber"}>{statusText(event.status)}</Badge>
                        </View>
                        {snoozedTo && (
                          <Text className="mt-1 text-xs text-slate-500">Next alert: {formatWhen(snoozedTo)}</Text>
                        )}
                      </View>
                      {actionable && (
                        <View className="flex-row flex-wrap gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === `${event.id}-taken`}
                            onPress={() => action(event.id, "taken")}
                          >
                            {"\u2713 Taken"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === `${event.id}-snooze`}
                            onPress={() => action(event.id, "snooze")}
                          >
                            Snooze 10 min
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === `${event.id}-skip`}
                            onPress={() => action(event.id, "skip")}
                          >
                            Skip
                          </Button>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </CardContent>
        </Card>
      ))}
    </View>
  );
}
