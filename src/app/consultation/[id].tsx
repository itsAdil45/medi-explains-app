import { useEffect, useState } from "react";
import { useLocalSearchParams, Redirect } from "expo-router";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";

import { api } from "@/api/client";
import { downloadAuthedFile, sharePdf } from "@/api/download";
import { useAuth } from "@/api/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import Recorder from "@/components/Recorder";
import PipelineStepper from "@/components/consultation/PipelineStepper";
import DoctorReview from "@/components/consultation/DoctorReview";
import PatientSummaryView from "@/components/consultation/PatientSummaryView";
import NextVisitCard from "@/components/consultation/NextVisitCard";
import ReportRequestCard from "@/components/consultation/ReportRequestCard";
import ReportUploadCard from "@/components/consultation/ReportUploadCard";
import BillCard from "@/components/consultation/BillCard";
import CrossCheckReview from "@/components/consultation/CrossCheckReview";
import MedicationAlarmManager from "@/components/MedicationAlarmManager";
import VoiceAssistant from "@/components/VoiceAssistant";

const POLL_MS = 3500;

const PROCESSING = new Set([
  "recording",
  "transcribing",
  "transcribed",
  "transcript_review",
  "summarising",
  "safety_check",
  "translating",
]);

// Mirrors the backend's _RETRYABLE_STATUSES in api/consultations.py.
const RETRYABLE = new Set(["transcribing", "summarising", "safety_check", "translating", "processing_failed"]);

export default function ConsultationView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState("");

  const [reviews, setReviews] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [langs, setLangs] = useState<any[]>([]);

  const [busy, setBusy] = useState(false);
  // Bumped after a retry so the polling effect below (which stops once a
  // consultation leaves PROCESSING) restarts and picks the pipeline back up.
  const [pollKey, setPollKey] = useState(0);

  async function refresh() {
    const x = await api.getConsultation(id);
    setC(x);
    return x;
  }

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const x = await api.getConsultation(id);
        if (!active) return;
        setC(x);
        if (PROCESSING.has(x.status)) timer = setTimeout(tick, POLL_MS);
      } catch (e: any) {
        if (active) setErr(e.message);
      }
    }

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, pollKey]);

  useEffect(() => {
    api.languages().then(setLangs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!c?.id || !user) return;
    api.crossChecksForConsultation(c.id).then(setReviews).catch(() => {});
    api.listDoctors().then(setDoctors).catch(() => {});
    // Only doctor-side roles have directory access to the patient list -
    // harmless to call for a patient viewing their own page too, but
    // skipped since it would just 403.
    if (user.role !== "patient") {
      api.listPatients().then(setPatients).catch(() => {});
    }
  }, [c?.id, c?.status, user?.role]);

  useEffect(() => {
    if (!c) return;
    setEdit(c.doctor_edited_summary || c.patient_summary_en || "");
  }, [c?.id, c?.patient_summary_en, c?.doctor_edited_summary]);

  if (!authLoading && !user) return <Redirect href="/login" />;

  if (err) {
    return (
      <View className="flex-1 bg-white px-5 py-6">
        <View className="rounded-lg bg-red-50 px-4 py-3">
          <Text className="text-sm font-medium text-red-700">{err}</Text>
        </View>
      </View>
    );
  }

  if (!c) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-white">
        <ActivityIndicator />
        <Text className="text-sm text-slate-500">Loading…</Text>
      </View>
    );
  }

  const isTreating = (user.role === "doctor" || user.role === "admin") && (user.role === "admin" || c.doctor_id === user.id);
  const isReviewer = user.role === "cross_check_doctor" || (user.role === "doctor" && !isTreating);

  const processing = PROCESSING.has(c.status);
  // Created but never actually recorded - e.g. the doctor navigated away
  // before finishing the recording. Give the treating doctor a way to
  // record right from this page.
  const needsAudio = c.status === "recording";
  // Mirrors the backend's retryable-status set. Safe to offer even while the
  // pipeline may genuinely still be running - the backend no-ops with a 409
  // if a task is already active for this consultation.
  const canRetry = isTreating && RETRYABLE.has(c.status);
  const meds = c.structured_data?.medications || [];
  const langMeta = langs.find((l) => l.code === c.patient_language);
  const rtl = langMeta?.rtl;

  const transcriptStale = Boolean(c.model_metadata?.reviewed_transcript_stale);
  const editableSummary = ["drafted", "safety_review_required"].includes(c.status);
  // Do not allow the doctor to approve/edit an old patient summary after changing the transcript.
  const summaryReadyForReview = editableSummary && !transcriptStale;

  async function act(fn: () => Promise<any>) {
    setBusy(true);
    setErr(null);
    try {
      const result = await fn();
      if (result) setC(result);
      return result;
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const approve = () => act(() => api.approve(c.id, { edited_summary: edit, approve: true }));
  const regenerateReviewed = () => act(() => api.regenerateReviewedTranscript(c.id));

  const release = () => {
    const incomplete = meds.filter((m: any) => {
      const frequency = (m.frequency || "").trim();
      const duration = (m.duration || "").trim();
      const f = frequency.toLowerCase();
      const prn = m.as_needed || f.includes("as needed") || f.includes("prn");
      return !prn && (!frequency || !duration);
    });

    if (incomplete.length) {
      const names = incomplete.map((m: any) => m.name || m.canonical_name || "Medication").join(", ");
      setErr(
        `Cannot release yet. Complete frequency and duration for: ${names}. AI Healthcare+ will not invent medication duration.`,
      );
      return;
    }

    return act(() => api.release(c.id));
  };

  const retranslate = (lang: string) => act(() => api.retranslate(c.id, lang));

  async function retryPipeline() {
    const result = await act(() => api.retryPipeline(c.id));
    if (result) setPollKey((k) => k + 1);
  }

  async function uploadRecording(file: { uri: string; name: string; type: string }) {
    const result = await act(() => api.uploadAudio(c.id, file));
    if (result) setPollKey((k) => k + 1);
  }

  async function addMed() {
    await act(() =>
      api.addMedication(c.id, {
        name: "",
        dose: "",
        frequency: "",
        duration: "",
        confirm_identity: false,
        confirm_instructions: false,
      }),
    );
  }

  // Fetches the PDF with the auth header, then opens the OS share sheet so the
  // patient can save or send it. Throws on failure and lets PatientSummaryView
  // show the message inline - setErr here would replace this whole screen.
  async function downloadPdf() {
    const file = await downloadAuthedFile(api.pdfUrl(c.id), `care_summary_${c.id}`, ".pdf");
    await sharePdf(file.uri, "Your care summary");
  }

  const viewedDoctor = doctors.find((d) => d.id === c.doctor_id);
  const viewedPatient = patients.find((p) => p.id === c.patient_id);

  return (
    <>
      <ScrollView className="flex-1 bg-white px-5 py-6">
      <View className="mb-4 flex-row items-center gap-3">
        <Text className="text-xl font-bold tracking-tight text-slate-900">Consultation #{c.id}</Text>
        <StatusBadge status={c.status} />
      </View>

      {user.role === "patient" && viewedDoctor && (
        <Text className="-mt-2 mb-4 text-sm text-slate-600">
          Doctor: <Text className="font-semibold text-slate-900">{viewedDoctor.full_name}</Text>
          {viewedDoctor.specialty && ` \u00b7 ${viewedDoctor.specialty}`}
        </Text>
      )}

      {user.role !== "patient" && viewedPatient && (
        <Text className="-mt-2 mb-4 text-sm text-slate-600">
          Patient: <Text className="font-semibold text-slate-900">{viewedPatient.full_name}</Text>
          {viewedPatient.email && ` \u00b7 ${viewedPatient.email}`}
          {viewedPatient.phone && ` \u00b7 ${viewedPatient.phone}`}
        </Text>
      )}

      <PipelineStepper status={c.status} />

      {isTreating && c.released_at && <NextVisitCard c={c} setC={setC} />}
      {isTreating && c.released_at && <ReportRequestCard c={c} setC={setC} />}
      {isTreating && c.released_at && <BillCard c={c} setC={setC} doctorFee={user.doctor_fee} />}
      {user.role === "patient" && c.report_requested_at && <ReportUploadCard c={c} setC={setC} />}

      {needsAudio && isTreating && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Record consultation audio</CardTitle>
            <CardDescription>
              This consultation was created but never recorded. Record now to start the AI pipeline, or
              continue from where you left off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Recorder onComplete={uploadRecording} disabled={busy} />
            {busy && <Text className="text-center text-sm text-slate-500">Uploading…</Text>}
          </CardContent>
        </Card>
      )}

      {needsAudio && !isTreating && (
        <View className="mb-5 rounded-lg bg-slate-100 px-4 py-3">
          <Text className="text-[13px] text-slate-600">This consultation has not been recorded yet.</Text>
        </View>
      )}

      {processing && !needsAudio && (
        <View className="mb-5 gap-3 rounded-lg bg-sky-50 px-4 py-3">
          <Text className="text-[13px] text-sky-900">
            AI pipeline running. Speech, structured extraction, independent summaries, safety checks,
            translation and audio are processed as separate stages. This page refreshes automatically.
          </Text>
          {canRetry && (
            <Button variant="secondary" size="sm" disabled={busy} onPress={retryPipeline} className="self-start">
              Retry
            </Button>
          )}
        </View>
      )}

      {c.status === "processing_failed" && (
        <View className="mb-5 gap-3 rounded-lg bg-red-50 px-4 py-3">
          <Text className="text-[13px] text-red-900">
            <Text className="font-bold">Processing failed.</Text>{" "}
            {c.pipeline_error || "The AI pipeline did not complete for this consultation."}
          </Text>
          {canRetry && (
            <Button variant="danger" size="sm" disabled={busy} onPress={retryPipeline} className="self-start">
              Retry
            </Button>
          )}
        </View>
      )}

      {c.pipeline_error && c.status !== "processing_failed" && (
        <View className="mb-5 rounded-lg bg-red-50 px-4 py-3">
          <Text className="text-[13px] text-red-900">
            <Text className="font-bold">Pipeline warning:</Text> {c.pipeline_error}
          </Text>
        </View>
      )}

      {isTreating && !processing && (
        <DoctorReview
          c={c}
          setC={setC}
          edit={edit}
          setEdit={setEdit}
          meds={meds}
          langMeta={langMeta}
          rtl={rtl}
          busy={busy}
          editableSummary={summaryReadyForReview}
          transcriptStale={transcriptStale}
          approve={approve}
          release={release}
          regenerateReviewed={regenerateReviewed}
          retranslate={retranslate}
          addMed={addMed}
          refresh={refresh}
          reviews={reviews}
          doctors={doctors}
        />
      )}

      {user?.role === "patient" && (
        <PatientSummaryView
          c={c}
          meds={meds}
          langMeta={langMeta}
          rtl={rtl}
          busy={busy}
          retranslate={retranslate}
          downloadPdf={downloadPdf}
          refresh={refresh}
        />
      )}

      {isReviewer && <CrossCheckReview consultation={c} />}

      <View className="h-10" />
    </ScrollView>

      {/* Patient-only widgets - each no-ops (returns null) for any other
          role, so it's safe to always mount them here. */}
      <MedicationAlarmManager />
      <VoiceAssistant />
    </>
  );
}
