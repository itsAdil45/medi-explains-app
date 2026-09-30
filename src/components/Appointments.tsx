import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  Link2,
  UserX,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import SlotPicker from "../components/ui/SlotPicker";
import { SelectField } from "./ui/select";
import PatientAppointments from "./ui/PatientAppointments";
import {
  APPT_STATUS_STYLE,
  addDays,
  clinicToday,
  formatDate,
  formatTime,
} from "../lib/appointments";

const REFRESH_MS = 15000;

const SOURCE_LABEL: Record<string, string> = {
  phone: "Phone",
  web: "Online",
  reception: "Front desk",
};

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

export default function Appointments() {
  const { user } = useAuth();

  if (user?.role === "patient") {
    return <PatientAppointments />;
  }

  return <StaffAppointments />;
}

function StaffAppointments() {
  const { user, activeClinicId } = useAuth();

  const isStaff = user?.role === "receptionist" || user?.role === "admin";

  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState(
    isStaff ? "" : String(user?.id || ""),
  );
  const [date, setDate] = useState(clinicToday());
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [linking, setLinking] = useState<string | number | null>(null);
  const [linkPatientId, setLinkPatientId] = useState("");

  const [mode, setMode] = useState<"patient" | "guest">("patient");
  const [patientId, setPatientId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [slot, setSlot] = useState<string | null>(null);
  const [slotKey, setSlotKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isStaff) return;

    api
      .listDoctors(activeClinicId)
      .then(setDoctors)
      .catch(() => {});

    api
      .listPatients()
      .then(setPatients)
      .catch(() => {});
  }, [isStaff, activeClinicId]);

  // The picked doctor may not work at the newly selected clinic - make
  // front-desk staff pick again from that clinic's doctors.
  const [prevClinicId, setPrevClinicId] = useState(activeClinicId);
  if (prevClinicId !== activeClinicId) {
    setPrevClinicId(activeClinicId);
    if (isStaff) setDoctorId("");
    setSlot(null);
  }

  const refresh = useCallback(async () => {
    if (!doctorId) {
      setItems([]);
      return;
    }

    try {
      const data = await api.listAppointments(
        isStaff ? doctorId : undefined,
        date,
      );

      setItems(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load appointments");
    }
    // activeClinicId isn't read here, but it's sent as X-Clinic-Id on every
    // request - a clinic switch has to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, date, isStaff, activeClinicId]);

  useEffect(() => {
    refresh();

    const timer = setInterval(refresh, REFRESH_MS);

    return () => clearInterval(timer);
  }, [refresh]);

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

    const body: any = {
      doctor_id: Number(doctorId),
      start_at: slot,
    };

    if (mode === "patient") {
      body.patient_id = Number(patientId);
    } else {
      body.caller_name = guestName.trim();
      body.caller_phone = guestPhone.trim() || null;
    }

    await run(async () => {
      const appointment = await api.bookAppointment(body);

      setNotice(
        `Booked ${appointment.caller_name} at ${formatTime(
          appointment.start_at,
        )}.`,
      );

      setPatientId("");
      setGuestName("");
      setGuestPhone("");
    });
  }

  const isToday = date === clinicToday();

  const canBook =
    !!slot && (mode === "patient" ? !!patientId : guestName.trim().length >= 2);

  const active = items.filter(
    (appointment) => appointment.status !== "cancelled",
  );

  const doctorOptions = doctors.map((doctor) => ({
    id: doctor.id,
    label: doctor.full_name,
  }));

  const patientOptions = patients.map((patient) => ({
    id: patient.id,
    label: `${patient.full_name}${patient.phone ? ` · ${patient.phone}` : ""}`,
  }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="px-5 py-6"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="mb-6 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-xl font-bold tracking-tight text-[#1e293b]">
            Appointments
          </Text>

          <Text className="mt-1 text-sm leading-5 text-slate-500">
            Bookings from the phone line, online and the front desk. Check
            patients in to give them a queue token.
          </Text>
        </View>

        {isStaff && (
          <Pressable
            onPress={() => router.push("/doctor-hours")}
            className="flex-row items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2.5 active:bg-slate-200"
          >
            <Clock size={16} color="#475569" />
            <Text className="text-xs font-semibold text-slate-700">
              Doctor hours
            </Text>
          </Pressable>
        )}
      </View>

      {/* Filters */}
      <View className="mb-5">
        {isStaff && (
          <SelectField
            label="Doctor"
            value={doctorId}
            placeholder="Select a doctor"
            options={doctorOptions}
            onChange={setDoctorId}
          />
        )}

        <Text className="mb-1.5 text-sm font-medium text-slate-700">Date</Text>

        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityLabel="Previous day"
            onPress={() => setDate((current) => addDays(current, -1))}
            className="h-11 w-11 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
          >
            <ChevronLeft size={18} color="#475569" />
          </Pressable>

          <View className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <Text className="text-sm font-medium text-slate-800">
              {formatDate(date)}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Next day"
            onPress={() => setDate((current) => addDays(current, 1))}
            className="h-11 w-11 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
          >
            <ChevronRight size={18} color="#475569" />
          </Pressable>
        </View>
      </View>

      <View className="gap-5">
        {/* Booking */}
        {isStaff && doctorId && (
          <View className="rounded-xl border border-slate-200 bg-white p-5">
            <Text className="text-lg font-semibold text-slate-900">
              Book an appointment
            </Text>

            <Text className="mb-5 mt-1 text-sm text-slate-500">
              {formatDate(date)}
            </Text>

            {/* Mode */}
            <View className="mb-4 flex-row gap-2">
              <Pressable
                onPress={() => setMode("patient")}
                className={`rounded-full px-3.5 py-2 ${
                  mode === "patient" ? "bg-[#1e293b]" : "bg-slate-100"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    mode === "patient" ? "text-white" : "text-slate-600"
                  }`}
                >
                  Registered patient
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setMode("guest")}
                className={`rounded-full px-3.5 py-2 ${
                  mode === "guest" ? "bg-[#1e293b]" : "bg-slate-100"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    mode === "guest" ? "text-white" : "text-slate-600"
                  }`}
                >
                  Guest
                </Text>
              </Pressable>
            </View>

            {mode === "patient" ? (
              <SelectField
                label="Patient"
                value={patientId}
                placeholder="Select a patient"
                options={patientOptions}
                onChange={setPatientId}
              />
            ) : (
              <View>
                <Text className="mb-1.5 text-sm font-medium text-slate-700">
                  Name
                </Text>

                <TextInput
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="Guest name"
                  placeholderTextColor="#94a3b8"
                  className="mb-4 min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"
                />

                <Text className="mb-1.5 text-sm font-medium text-slate-700">
                  Phone (optional)
                </Text>

                <TextInput
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  placeholder="03XX XXXXXXX"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"
                />
              </View>
            )}

            <Text className="mb-1.5 text-sm font-medium text-slate-700">
              Time
            </Text>

            <SlotPicker
              doctorId={doctorId}
              clinicId={activeClinicId}
              date={date}
              value={slot}
              onChange={setSlot}
              refreshKey={slotKey}
            />

            <View className="mt-4">
              <Pressable
                disabled={busy || !canBook}
                onPress={book}
                className={`h-11 flex-row items-center justify-center gap-2 rounded-lg bg-[#792884] ${
                  busy || !canBook ? "opacity-50" : "active:opacity-80"
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
                <Text className="mt-3 text-xs font-medium text-red-600">
                  {err}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Appointment list */}
        <View className="rounded-xl border border-slate-200 bg-white p-5">
          <Text className="text-lg font-semibold text-slate-900">
            {formatDate(date)}
          </Text>

          <Text className="mb-5 mt-1 text-sm text-slate-500">
            {active.length} appointment
            {active.length === 1 ? "" : "s"}
          </Text>

          {err && (
            <Text className="mb-3 text-xs font-medium text-red-600">{err}</Text>
          )}

          {!doctorId && (
            <Text className="py-6 text-center text-sm text-slate-500">
              Select a doctor to see their appointments.
            </Text>
          )}

          {doctorId && items.length === 0 && (
            <Text className="py-6 text-center text-sm text-slate-500">
              No appointments on this day.
            </Text>
          )}

          <View className="gap-2">
            {items.map((appointment) => (
              <View
                key={appointment.id}
                className={`rounded-lg border border-slate-200 p-3 ${
                  appointment.status === "cancelled" ? "opacity-60" : ""
                }`}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 flex-row items-start gap-3">
                    <Text className="w-[55px] text-sm font-bold text-[#1e293b]">
                      {formatTime(appointment.start_at)}
                    </Text>

                    <View className="flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-sm font-semibold text-[#1e293b]">
                          {appointment.caller_name}
                        </Text>

                        {appointment.patient_id == null && (
                          <View className="rounded bg-amber-50 px-1.5 py-0.5">
                            <Text className="text-[10px] font-bold uppercase text-amber-700">
                              Guest
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text className="mt-1 text-xs text-slate-500">
                        {SOURCE_LABEL[appointment.source] || appointment.source}
                        {appointment.caller_phone
                          ? ` · ${appointment.caller_phone}`
                          : ""}
                        {appointment.token_number != null
                          ? ` · Token #${appointment.token_number}`
                          : ""}
                      </Text>
                    </View>
                  </View>

                  <StatusPill status={appointment.status} />
                </View>

                {isStaff && appointment.status === "booked" && (
                  <View className="mt-3 flex-row justify-end gap-2">
                    {appointment.patient_id == null && (
                      <Pressable
                        disabled={busy}
                        onPress={() => {
                          setLinking(
                            linking === appointment.id ? null : appointment.id,
                          );
                          setLinkPatientId("");
                        }}
                        className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                      >
                        <Link2 size={15} color="#475569" />
                      </Pressable>
                    )}

                    {isToday && (
                      <Pressable
                        disabled={busy || appointment.patient_id == null}
                        onPress={() =>
                          run(() => api.checkInAppointment(appointment.id))
                        }
                        className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                      >
                        <LogIn size={15} color="#475569" />
                      </Pressable>
                    )}

                    {isToday && (
                      <Pressable
                        disabled={busy}
                        onPress={() =>
                          run(() => api.markNoShow(appointment.id))
                        }
                        className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                      >
                        <UserX size={15} color="#475569" />
                      </Pressable>
                    )}

                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        run(() => api.cancelAppointment(appointment.id))
                      }
                      className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100 active:bg-slate-200"
                    >
                      <X size={15} color="#475569" />
                    </Pressable>
                  </View>
                )}

                {/* Link patient */}
                {linking === appointment.id && (
                  <View className="mt-3 border-t border-slate-100 pt-3">
                    <SelectField
                      label="Patient account"
                      value={linkPatientId}
                      placeholder="Select a patient"
                      options={patientOptions}
                      onChange={setLinkPatientId}
                    />

                    <View className="flex-row items-center gap-2">
                      <Pressable
                        disabled={busy || !linkPatientId}
                        onPress={() =>
                          run(async () => {
                            await api.linkAppointment(
                              appointment.id,
                              Number(linkPatientId),
                            );
                            setLinking(null);
                          })
                        }
                        className={`rounded-lg bg-[#792884] px-4 py-2.5 ${
                          busy || !linkPatientId ? "opacity-50" : ""
                        }`}
                      >
                        <Text className="text-sm font-semibold text-white">
                          Link
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => router.push("/reception")}
                        className="px-2 py-2"
                      >
                        <Text className="text-xs font-medium text-[#792884]">
                          No account? Create one
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
