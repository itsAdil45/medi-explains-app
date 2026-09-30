import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  UserPlus,
  PhoneCall,
  Check,
  SkipForward,
  Play,
} from "lucide-react-native";
import { api } from "../api/client";
import { useAuth } from "../api/auth";

const REFRESH_MS = 8000;

const STATUS_STYLE = {
  waiting: {
    container: "bg-slate-100",
    text: "text-slate-600",
  },
  called: {
    container: "bg-amber-100",
    text: "text-amber-800",
  },
  in_progress: {
    container: "bg-sky-100",
    text: "text-sky-800",
  },
  done: {
    container: "bg-emerald-100",
    text: "text-emerald-800",
  },
  skipped: {
    container: "bg-red-100",
    text: "text-red-700",
  },
};

function StatusPill({ status }: { status: string }) {
  const style =
    STATUS_STYLE[status as keyof typeof STATUS_STYLE] || STATUS_STYLE.waiting;

  return (
    <View className={`rounded-full px-2.5 py-1 ${style.container}`}>
      <Text className={`text-[11px] font-semibold capitalize ${style.text}`}>
        {status.replace("_", " ")}
      </Text>
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { id: string | number; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => String(option.id) === value);

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-slate-700">{label}</Text>

      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        className="min-h-11 justify-center rounded-lg border border-slate-200 bg-slate-50 px-3"
      >
        <Text
          className={`text-sm ${
            selected ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {selected?.label || placeholder}
        </Text>
      </Pressable>

      {open && (
        <View className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {options.map((option) => {
            const isSelected = String(option.id) === value;

            return (
              <Pressable
                key={String(option.id)}
                onPress={() => {
                  onChange(String(option.id));
                  setOpen(false);
                }}
                className={`px-3 py-3 ${
                  isSelected ? "bg-purple-50" : "active:bg-slate-50"
                }`}
              >
                <Text
                  className={`text-sm ${
                    isSelected
                      ? "font-semibold text-[#792884]"
                      : "text-slate-800"
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function QueueManager() {
  const { user, activeClinicId } = useAuth();

  const isReceptionist =
    user?.role === "receptionist" || user?.role === "admin";

  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isReceptionist) {
      api
        .listDoctors(activeClinicId)
        .then(setDoctors)
        .catch(() => {});
    }

    api
      .listPatients()
      .then(setPatients)
      .catch(() => {});
  }, [isReceptionist, activeClinicId]);

  const effectiveDoctorId = isReceptionist ? doctorId : String(user?.id || "");

  const refresh = useCallback(async () => {
    if (!effectiveDoctorId) {
      setEntries([]);
      return;
    }

    try {
      const data = await api.listQueue(effectiveDoctorId);
      setEntries(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load queue");
    }
  }, [effectiveDoctorId]);

  useEffect(() => {
    refresh();

    const timer = setInterval(refresh, REFRESH_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  async function addPatient() {
    if (!patientId || !effectiveDoctorId) return;

    setBusy(true);
    setErr(null);

    try {
      await api.addToQueue({
        patient_id: Number(patientId),
        doctor_id: Number(effectiveDoctorId),
      });

      setPatientId("");
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to add patient");
    } finally {
      setBusy(false);
    }
  }

  async function callNext() {
    const next = entries.find((entry) => entry.status === "waiting");

    if (!next) return;

    setBusy(true);
    setErr(null);

    try {
      await api.callQueueEntry(next.id);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to call next patient");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string | number, status: string) {
    setBusy(true);
    setErr(null);

    try {
      await api.updateQueueStatus(id, status);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Failed to update queue status");
    } finally {
      setBusy(false);
    }
  }

  const waitingCount = entries.filter(
    (entry) => entry.status === "waiting",
  ).length;

  const doctorOptions = doctors.map((doctor) => ({
    id: doctor.id,
    label: doctor.full_name,
  }));

  const patientOptions = patients.map((patient) => ({
    id: patient.id,
    label: `${patient.full_name} (${patient.email})`,
  }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-xl font-bold tracking-tight text-[#1e293b]">
        Token queue
      </Text>

      <Text className="mb-6 mt-1 text-sm text-slate-500">
        Add patients to a doctor's queue and call the next one in.
      </Text>

      <View className="gap-5">
        {/* Add patient */}
        {isReceptionist && (
          <View className="rounded-xl border border-slate-200 bg-white p-5">
            <Text className="text-lg font-semibold text-slate-900">
              Add to queue
            </Text>

            <Text className="mb-5 mt-1 text-sm text-slate-500">
              Choose a doctor, then a patient.
            </Text>

            <SelectField
              label="Doctor"
              value={doctorId}
              placeholder="Select a doctor"
              options={doctorOptions}
              onChange={setDoctorId}
            />

            <SelectField
              label="Patient"
              value={patientId}
              placeholder="Select a patient"
              options={patientOptions}
              onChange={setPatientId}
            />

            <Pressable
              disabled={busy || !patientId || !effectiveDoctorId}
              onPress={addPatient}
              className={`h-11 flex-row items-center justify-center gap-2 rounded-lg bg-[#792884] ${
                busy || !patientId || !effectiveDoctorId
                  ? "opacity-50"
                  : "active:opacity-80"
              }`}
            >
              {busy ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <UserPlus size={17} color="white" />
              )}

              <Text className="text-sm font-semibold text-white">Add</Text>
            </Pressable>

            {err && (
              <Text className="mt-3 text-xs font-medium text-red-600">
                {err}
              </Text>
            )}
          </View>
        )}

        {/* Queue */}
        <View className="rounded-xl border border-slate-200 bg-white p-5">
          <View className="mb-5 flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-lg font-semibold text-slate-900">
                Today's queue
              </Text>

              <Text className="mt-1 text-sm text-slate-500">
                {waitingCount} waiting
              </Text>
            </View>

            <Pressable
              disabled={busy || !waitingCount}
              onPress={callNext}
              className={`flex-row items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2.5 ${
                busy || !waitingCount ? "opacity-50" : "active:bg-slate-200"
              }`}
            >
              <PhoneCall size={16} color="#475569" />

              <Text className="text-sm font-semibold text-slate-700">
                Call next
              </Text>
            </Pressable>
          </View>

          {!effectiveDoctorId && (
            <View className="py-6">
              <Text className="text-center text-sm text-slate-500">
                Select a doctor to see their queue.
              </Text>
            </View>
          )}

          {effectiveDoctorId && entries.length === 0 && (
            <View className="py-6">
              <Text className="text-center text-sm text-slate-500">
                Nobody in the queue yet.
              </Text>
            </View>
          )}

          <View className="gap-2">
            {entries.map((entry) => (
              <View
                key={entry.id}
                className="rounded-lg border border-slate-200 px-3.5 py-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 flex-row items-center gap-3">
                    <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                      <Text className="text-xs font-bold text-slate-600">
                        #{entry.token_number}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className="text-sm font-semibold text-[#1e293b]"
                      >
                        {entry.patient_name}
                      </Text>

                      {isReceptionist && (
                        <Text
                          numberOfLines={1}
                          className="mt-0.5 text-xs text-slate-500"
                        >
                          {entry.doctor_name}
                        </Text>
                      )}
                    </View>
                  </View>

                  <StatusPill status={entry.status} />
                </View>

                {/* Actions */}
                <View className="mt-3 flex-row justify-end gap-2">
                  {entry.status === "waiting" && (
                    <Pressable
                      disabled={busy}
                      onPress={() => setStatus(entry.id, "called")}
                      className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                    >
                      <PhoneCall size={15} color="#475569" />
                    </Pressable>
                  )}

                  {entry.status === "called" && (
                    <Pressable
                      disabled={busy}
                      onPress={() => setStatus(entry.id, "in_progress")}
                      className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                    >
                      <Play size={15} color="#475569" />
                    </Pressable>
                  )}

                  {entry.status === "in_progress" && (
                    <Pressable
                      disabled={busy}
                      onPress={() => setStatus(entry.id, "done")}
                      className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                    >
                      <Check size={15} color="#475569" />
                    </Pressable>
                  )}

                  {(entry.status === "waiting" ||
                    entry.status === "called") && (
                    <Pressable
                      disabled={busy}
                      onPress={() => setStatus(entry.id, "skipped")}
                      className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                    >
                      <SkipForward size={15} color="#475569" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>

          {err && !isReceptionist && (
            <Text className="mt-3 text-xs font-medium text-red-600">{err}</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
