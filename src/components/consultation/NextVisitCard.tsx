import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarClock } from "lucide-react-native";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

function toISODate(d: Date) {
  // Not d.toISOString().slice(0,10) on purpose - that reads UTC fields, which
  // rolls back to the previous day for anyone west of UTC at local midnight.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NextVisitCard({ c, setC }: { c: any; setC: (c: any) => void }) {
  const [value, setValue] = useState(c.next_visit_date || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const dateValue = value ? new Date(value + "T00:00:00") : new Date();

  function pick(date: Date | undefined) {
    if (date) {
      setValue(toISODate(date));
      setSaved(false);
    }
  }

  async function save() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      setC(await api.setNextVisit(c.id, value || null));
      setSaved(true);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setValue("");
    setSaved(false);
    setC(await api.setNextVisit(c.id, null));
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <View className="flex-row items-center gap-1.5">
          <CalendarClock size={16} color="#0f172a" />
          <CardTitle>Next visit</CardTitle>
        </View>
        <CardDescription>The patient gets a reminder email a few days before this date.</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row flex-wrap items-center gap-3">
          {/* iOS's "compact" display is a self-contained popover - no
              open/close state needed. Android has no inline equivalent, so
              the dialog is only mounted while showPicker is true. */}
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={dateValue}
              mode="date"
              display="compact"
              onChange={(_, date) => pick(date)}
            />
          ) : (
            <Pressable
              onPress={() => setShowPicker(true)}
              className="rounded-lg border border-slate-200 px-3 py-2.5"
            >
              <Text className="text-sm text-slate-900">{value || "Select date"}</Text>
            </Pressable>
          )}
          {showPicker && Platform.OS !== "ios" && (
            <DateTimePicker
              value={dateValue}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowPicker(false);
                if (event.type === "set") pick(date);
              }}
            />
          )}

          <Button onPress={save} disabled={busy || value === (c.next_visit_date || "")} loading={busy}>
            Save
          </Button>
          {c.next_visit_date && (
            <Button variant="secondary" disabled={busy} onPress={clear}>
              Clear
            </Button>
          )}
        </View>
        {err && <Text className="text-xs font-medium text-red-600">{err}</Text>}
        {saved && <Text className="text-xs font-medium text-emerald-600">Saved.</Text>}
      </CardContent>
    </Card>
  );
}
