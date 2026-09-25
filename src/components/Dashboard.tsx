import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useRouter } from "expo-router";
import Nav from "./Nav";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  Plus,
  Search,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react-native";
import { api } from "@/api/client";
import { useAuth } from "@/api/auth";
import { StatusBadge } from "@/components/ui/badge";
import MedicationAlarmManager from "@/components/MedicationAlarmManager";
import VoiceAssistant from "@/components/VoiceAssistant";

const NEEDS_ATTENTION = [
  "safety_review_required",
  "drafted",
  "processing_failed",
  "rejected",
];
const RELEASED = ["released", "cross_checked"];
// Everything else (recording, transcribing, translating, under_cross_check, ...) counts as "in progress".

const LANG_LABEL: Record<string, string> = {
  en: "EN",
  ur: "UR",
  ar: "AR",
  pa_shah: "PA",
  ps: "PS",
  sd: "SD",
};

function groupOf(item: any, isTreatingDoctor: boolean) {
  // A patient-uploaded report awaiting doctor review is "needs attention"
  // regardless of the pipeline status - reports are attached post-release,
  // no push notification exists, so the doctor finds it here.
  if (isTreatingDoctor && item.report_uploaded_at && !item.report_reviewed_at)
    return "attention";
  if (NEEDS_ATTENTION.includes(item.status)) return "attention";
  if (RELEASED.includes(item.status)) return "released";
  return "progress";
}

const TABS = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "progress", label: "In progress" },
  { key: "released", label: "Released" },
] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [peopleById, setPeopleById] = useState<Record<string, any>>({});

  // Receptionists never have consultations of their own - this page would
  // just be empty for them. The queue is their actual day-to-day workspace.
  const isReceptionist = user.role === "receptionist";
  const isTreatingDoctor = user.role === "doctor" || user.role === "admin";
  const isReviewingDoctor = user.role === "cross_check_doctor";
  const showsDoctorColumn = user.role === "patient";
  const showsPatientColumn = isTreatingDoctor || isReviewingDoctor;

  useEffect(() => {
    api
      .listConsultations()
      .then(setItems)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // A consultation only carries doctor_id/patient_id - resolve the other
  // party's name from the existing directory endpoints rather than adding
  // it to every consultation response.
  useEffect(() => {
    if (showsDoctorColumn) {
      api
        .listDoctors()
        .then((list) =>
          setPeopleById(Object.fromEntries(list.map((d: any) => [d.id, d]))),
        )
        .catch(() => {});
    } else if (showsPatientColumn) {
      api
        .listPatients()
        .then((list) =>
          setPeopleById(Object.fromEntries(list.map((p: any) => [p.id, p]))),
        )
        .catch(() => {});
    }
  }, [showsDoctorColumn, showsPatientColumn]);

  const counts = useMemo(() => {
    const c = { attention: 0, progress: 0, released: 0 };
    for (const item of items)
      c[groupOf(item, isTreatingDoctor) as keyof typeof c]++;
    return c;
  }, [items, isTreatingDoctor]);

  const filtered = useMemo(() => {
    return items
      .filter(
        (item) => tab === "all" || groupOf(item, isTreatingDoctor) === tab,
      )
      .filter((item) => {
        if (!q.trim()) return true;
        const needle = q.trim().toLowerCase();
        return (
          String(item.id).includes(needle) ||
          item.status.replace("_", " ").includes(needle) ||
          (item.patient_language || "").toLowerCase().includes(needle)
        );
      });
  }, [items, tab, q, isTreatingDoctor]);

  const title =
    user.role === "patient"
      ? "My care summaries"
      : user.role === "cross_check_doctor"
        ? "Cases awaiting your review"
        : "My consultations";

  if (isReceptionist) return <Redirect href="/queue" />;

  return (
    <>
      <ScrollView className=" bg-white px-5 py-6 ">
      <View className="mb-5 flex-row items-start justify-between">
        <View>
          <Text className="mb-1 text-xl font-bold tracking-tight text-slate-900">
            {title}
          </Text>
          <Text className="text-[13px] text-slate-500">
            {items.length} total
            {counts.attention > 0 &&
              ` \u00b7 ${counts.attention} need${counts.attention === 1 ? "s" : ""} your attention`}
          </Text>
        </View>
        {(user.role === "doctor" || user.role === "admin") && (
          <Pressable
            onPress={() => router.push("/new")}
            className="flex-row items-center gap-1.5 rounded-lg bg-[#4ab96a] px-4 py-2.5"
          >
            <Plus size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white">
              New consultation
            </Text>
          </Pressable>
        )}
      </View>

      {items.length > 0 && (
        <View className="mb-6 flex-col gap-3 ">
          <View>
            <View className=" flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <View className="size-9 items-center justify-center rounded-lg bg-amber-100">
                <AlertTriangle size={18} color="#92400e" strokeWidth={2} />
              </View>
              <View>
                <Text className="text-lg font-bold leading-tight text-slate-900">
                  {counts.attention}
                </Text>
                <Text className="text-[11px] text-slate-500">Needs review</Text>
              </View>
            </View>
            <View className=" flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
              <View className="size-9 items-center justify-center rounded-lg bg-sky-100">
                <Clock size={18} color="#075985" strokeWidth={2} />
              </View>
              <View>
                <Text className="text-lg font-bold leading-tight text-slate-900">
                  {counts.progress}
                </Text>
                <Text className="text-[11px] text-slate-500">In progress</Text>
              </View>
            </View>
          </View>
          <View className=" flex-row items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-6">
            <View className="size-9 items-center justify-center rounded-lg bg-emerald-100">
              <CheckCircle2 size={18} color="#065f46" strokeWidth={2} />
            </View>
            <View>
              <Text className="text-lg font-bold leading-tight text-slate-900">
                {counts.released}
              </Text>
              <Text className="text-[11px] text-slate-500">Released</Text>
            </View>
          </View>
        </View>
      )}
      <View className="mt-2 ">
        {items.length > 0 && (
          <View className="mb-3.5 gap-0">
            <View className="flex-row gap-1 rounded-lg bg-slate-100 p-[3px] ">
              {TABS.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  className={` items-center rounded-md px-2 py-1.5 ${tab === t.key ? "bg-white shadow-sm" : ""}`}
                >
                  <Text
                    className={`text-xs font-semibold ${tab === t.key ? "text-slate-900" : "text-slate-500"}`}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row items-center rounded-lg border border-slate-200 px-2.5">
              <Search size={14} color="#94a3b8" />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search consultations"
                placeholderTextColor="#94a3b8"
                className="ml-2  py-2 text-[13px] text-slate-900"
              />
            </View>
          </View>
        )}

        {loading && (
          <View className="flex-row items-center gap-2 py-8">
            <ActivityIndicator />
            <Text className="text-sm text-slate-500">Loading…</Text>
          </View>
        )}
        {err && (
          <Text className="py-8 text-sm font-medium text-red-600">{err}</Text>
        )}

        {!loading && !err && items.length === 0 && (
          <View className="items-center rounded-xl border border-dashed border-slate-300 py-14">
            <Text className="text-sm text-slate-500">Nothing here yet.</Text>
          </View>
        )}

        {!loading && !err && items.length > 0 && filtered.length === 0 && (
          <View className="items-center rounded-xl border border-dashed border-slate-300 py-14">
            <Text className="text-sm text-slate-500">
              No consultations match this filter.
            </Text>
          </View>
        )}

        <View className="gap-2 pb-6">
          {filtered.map((c) => (
            <Link key={c.id} href={`/consultation/${c.id}`} asChild>
              <Pressable
                className={`flex-row items-center gap-3 rounded-[11px] border bg-white px-4 py-3.5 ${
                  c.status === "processing_failed"
                    ? "border-red-200"
                    : "border-slate-200"
                }`}
              >
                <View className="size-9 items-center justify-center rounded-full bg-slate-100">
                  <Text className="text-xs font-bold text-slate-600">
                    {LANG_LABEL[c.patient_language] ||
                      c.patient_language?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View className="min-w-0 ">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-slate-900">
                      Consultation #{c.id}
                    </Text>
                    <StatusBadge status={c.status} />
                  </View>
                  {showsDoctorColumn && peopleById[c.doctor_id] && (
                    <Text
                      className="mt-0.5 text-xs font-medium text-slate-700"
                      numberOfLines={1}
                    >
                      {peopleById[c.doctor_id].full_name}
                    </Text>
                  )}
                  {showsPatientColumn && peopleById[c.patient_id] && (
                    <Text
                      className="mt-0.5 text-xs font-medium text-slate-700"
                      numberOfLines={1}
                    >
                      {peopleById[c.patient_id].full_name}
                      {peopleById[c.patient_id].email &&
                        ` \u00b7 ${peopleById[c.patient_id].email}`}
                      {peopleById[c.patient_id].phone &&
                        ` \u00b7 ${peopleById[c.patient_id].phone}`}
                    </Text>
                  )}
                  <Text className="mt-0.5 text-xs text-slate-500">
                    {c.patient_language?.toUpperCase()} {"\u00b7"}{" "}
                    {new Date(c.created_at).toLocaleString()}
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
    </ScrollView>

      {/* Patient-only floating widgets - each no-ops (returns null) for any
          other role, so it's safe to always mount them here. */}
      <MedicationAlarmManager />
      <VoiceAssistant />
    </>
  );
}
