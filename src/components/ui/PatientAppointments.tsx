import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { CalendarPlus, X, Check } from "lucide-react-native";
import { api } from "../../api/client";
import SlotPicker from "./SlotPicker";
import {
  APPT_STATUS_STYLE,
  clinicToday,
  formatDate,
  formatTime,
} from "../../lib/appointments";

const STATUS_STYLE: Record<string, { container: string; text: string }> = {
  booked: {
    container: "bg-slate-100",
    text: "text-slate-600",
  },
  cancelled: {
    container: "bg-red-100",
    text: "text-red-700",
  },
  checked_in: {
    container: "bg-sky-100",
    text: "text-sky-800",
  },
  completed: {
    container: "bg-emerald-100",
    text: "text-emerald-800",
  },
  no_show: {
    container: "bg-amber-100",
    text: "text-amber-800",
  },
};

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] || {
    container: "bg-slate-100",
    text: "text-slate-600",
  };

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
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { id: string | number; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => String(option.id) === value);

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-medium text-slate-700">{label}</Text>

      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`min-h-11 justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <Text
          className={`text-sm ${
            selected ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {selected?.label || placeholder}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          className="flex-1 justify-center bg-black/40 px-6"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="max-h-[70%] rounded-2xl bg-white p-4"
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="mb-3 text-base font-semibold text-slate-900">
              {label}
            </Text>

            <ScrollView>
              {options.map((option) => {
                const selectedOption = String(option.id) === value;

                return (
                  <Pressable
                    key={String(option.id)}
                    onPress={() => {
                      onChange(String(option.id));
                      setOpen(false);
                    }}
                    className={`flex-row items-center rounded-lg px-3 py-3 ${
                      selectedOption ? "bg-purple-50" : "active:bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`flex-1 text-sm ${
                        selectedOption
                          ? "font-semibold text-[#792884]"
                          : "text-slate-800"
                      }`}
                    >
                      {option.label}
                    </Text>

                    {selectedOption && <Check size={17} color="#792884" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function PatientAppointments() {
  const [clinics, setClinics] = useState<any[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(clinicToday());
  const [slot, setSlot] = useState<string | null>(null);
  const [slotKey, setSlotKey] = useState(0);
  const [mine, setMine] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const appointments = await api.myAppointments();
      setMine(appointments);
    } catch (e: any) {
      setErr(e?.message || "Failed to load appointments");
    }
  }, []);

  useEffect(() => {
    api
      .listClinics()
      .then((list) => {
        setClinics(list);

        if (list.length === 1) {
          setClinicId(String(list[0].id));
        }
      })
      .catch(() => {});

    refresh();
  }, [refresh]);

  useEffect(() => {
    setDoctorId("");

    if (!clinicId) {
      setDoctors([]);
      return;
    }

    api
      .listDoctors(clinicId)
      .then(setDoctors)
      .catch(() => {});
  }, [clinicId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    setNotice(null);

    try {
      await fn();
      await refresh();
      setSlotKey((key) => key + 1);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function book() {
    if (!slot) return;

    await run(async () => {
      const appointment = await api.bookAppointment({
        doctor_id: Number(doctorId),
        start_at: slot,
        clinic_id: Number(clinicId),
      });

      setNotice(
        `Booked with ${appointment.doctor_name} at ${appointment.clinic_name} on ${formatDate(
          appointment.start_at,
        )} at ${formatTime(appointment.start_at)}.`,
      );
    });
  }

  const clinicOptions = clinics.map((clinic) => ({
    id: clinic.id,
    label: clinic.name,
  }));

  const doctorOptions = doctors.map((doctor) => ({
    id: doctor.id,
    label: `${doctor.full_name}${
      doctor.specialty ? ` · ${doctor.specialty}` : ""
    }`,
  }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-xl font-bold tracking-tight text-[#1e293b]">
        Appointments
      </Text>

      <Text className="mb-6 mt-1 text-sm leading-5 text-slate-500">
        Book a visit, or see and cancel your upcoming ones. You can also book by
        phone.
      </Text>

      <View className="gap-5">
        {/* Book */}
        <View className="rounded-xl border border-slate-200 bg-white p-5">
          <Text className="text-lg font-semibold text-slate-900">
            Book an appointment
          </Text>

          <Text className="mb-5 mt-1 text-sm text-slate-500">
            {clinics.length > 1
              ? "Choose a clinic, a doctor, a day, then a free time."
              : "Choose a doctor, a day, then a free time."}
          </Text>

          {clinics.length > 1 && (
            <SelectField
              label="Clinic"
              value={clinicId}
              placeholder="Select a clinic"
              options={clinicOptions}
              onChange={setClinicId}
            />
          )}

          <SelectField
            label="Doctor"
            value={doctorId}
            placeholder={clinicId ? "Select a doctor" : "Choose a clinic first"}
            options={doctorOptions}
            onChange={setDoctorId}
            disabled={!clinicId}
          />

          <Text className="mb-1.5 text-sm font-medium text-slate-700">Day</Text>

          <View className="mb-4 flex-row items-center gap-2">
            <Pressable
              onPress={() =>
                setDate((current) => {
                  const [year, month, day] = current.split("-").map(Number);

                  const next = new Date(year, month - 1, day - 1);

                  return [
                    next.getFullYear(),
                    String(next.getMonth() + 1).padStart(2, "0"),
                    String(next.getDate()).padStart(2, "0"),
                  ].join("-");
                })
              }
              className="h-11 w-11 items-center justify-center rounded-lg bg-slate-100"
            >
              <Text className="text-lg text-slate-600">‹</Text>
            </Pressable>

            <View className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <Text className="text-sm font-medium text-slate-800">
                {formatDate(date)}
              </Text>
            </View>

            <Pressable
              onPress={() =>
                setDate((current) => {
                  const [year, month, day] = current.split("-").map(Number);

                  const next = new Date(year, month - 1, day + 1);

                  return [
                    next.getFullYear(),
                    String(next.getMonth() + 1).padStart(2, "0"),
                    String(next.getDate()).padStart(2, "0"),
                  ].join("-");
                })
              }
              className="h-11 w-11 items-center justify-center rounded-lg bg-slate-100"
            >
              <Text className="text-lg text-slate-600">›</Text>
            </Pressable>
          </View>

          <Text className="mb-1.5 text-sm font-medium text-slate-700">
            Time
          </Text>

          <SlotPicker
            doctorId={doctorId}
            clinicId={clinicId}
            date={date}
            value={slot}
            onChange={setSlot}
            refreshKey={slotKey}
          />

          <Pressable
            disabled={busy || !slot}
            onPress={book}
            className={`mt-4 h-11 flex-row items-center justify-center gap-2 rounded-lg bg-[#792884] ${
              busy || !slot ? "opacity-50" : "active:opacity-80"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <CalendarPlus size={17} color="white" />
            )}

            <Text className="text-sm font-semibold text-white">
              {slot ? `Book ${formatTime(slot)}` : "Book"}
            </Text>
          </Pressable>

          {notice && (
            <Text className="mt-3 text-xs font-medium text-emerald-700">
              {notice}
            </Text>
          )}

          {err && (
            <Text className="mt-3 text-xs font-medium text-red-600">{err}</Text>
          )}
        </View>

        {/* Upcoming */}
        <View className="rounded-xl border border-slate-200 bg-white p-5">
          <Text className="mb-5 text-lg font-semibold text-slate-900">
            Your upcoming appointments
          </Text>

          {mine.length === 0 && (
            <Text className="py-6 text-center text-sm text-slate-500">
              No upcoming appointments.
            </Text>
          )}

          <View className="gap-2">
            {mine.map((appointment) => (
              <View
                key={appointment.id}
                className="rounded-lg border border-slate-200 p-3"
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-[#1e293b]">
                      {appointment.doctor_name}

                      {appointment.clinic_name && (
                        <Text className="font-normal text-slate-500">
                          {" · "}
                          {appointment.clinic_name}
                        </Text>
                      )}
                    </Text>

                    <Text className="mt-1 text-xs text-slate-500">
                      {formatDate(appointment.start_at)} at{" "}
                      {formatTime(appointment.start_at)}
                      {appointment.token_number != null
                        ? ` · Token #${appointment.token_number}`
                        : ""}
                    </Text>
                  </View>

                  <StatusPill status={appointment.status} />
                </View>

                {appointment.status === "booked" && (
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      run(() => api.cancelAppointment(appointment.id))
                    }
                    className="mt-3 flex-row items-center justify-center gap-2 self-end rounded-lg bg-slate-100 px-3 py-2 active:bg-slate-200"
                  >
                    <X size={14} color="#475569" />

                    <Text className="text-xs font-semibold text-slate-700">
                      Cancel
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
