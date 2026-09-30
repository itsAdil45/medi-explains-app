import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Check } from "lucide-react-native";
import { api } from "../../api/client";
import { formatTime } from "../../lib/appointments";

type Slot = {
  start: string;
};

export default function SlotPicker({
  doctorId,
  clinicId,
  date,
  value,
  onChange,
  refreshKey = 0,
}: {
  doctorId: string | number;
  clinicId?: string | number;
  date: string;
  value: string | null;
  onChange: (value: string | null) => void;
  refreshKey?: number;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    onChange(null);

    if (!doctorId || !date) {
      setSlots([]);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setErr(null);

    api
      .getAvailability(doctorId, date, clinicId)
      .then((response) => {
        if (!cancelled) {
          setSlots(response.slots);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setErr(e?.message || "Failed to load available times");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };

    // Intentionally reload when refreshKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, clinicId, date, refreshKey]);

  if (!doctorId) {
    return (
      <Text className="text-sm text-slate-500">
        Choose a doctor to see free times.
      </Text>
    );
  }

  if (loading) {
    return (
      <View className="flex-row items-center gap-2 py-2">
        <ActivityIndicator size="small" color="#792884" />
        <Text className="text-sm text-slate-500">Loading free times...</Text>
      </View>
    );
  }

  if (err) {
    return <Text className="text-xs font-medium text-red-600">{err}</Text>;
  }

  if (!slots.length) {
    return (
      <Text className="text-sm text-slate-500">No free times on this day.</Text>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {slots.map((slot) => {
        const selected = value === slot.start;

        return (
          <Pressable
            key={slot.start}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : slot.start)}
            className={`min-w-[92px] flex-row items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 ${
              selected
                ? "border-[#792884] bg-[#792884]"
                : "border-slate-200 bg-white active:border-[#792884]"
            }`}
          >
            {selected && <Check size={14} color="white" strokeWidth={2.5} />}

            <Text
              className={`text-sm font-medium ${
                selected ? "text-white" : "text-slate-700"
              }`}
            >
              {formatTime(slot.start)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
