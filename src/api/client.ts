// Thin wrapper around fetch, mimicking the website's api/client.js.
// Adds the JWT, decodes JSON, raises on non-2xx.
//
// Things that can't carry over as-is from the web version:
// - localStorage doesn't exist in React Native, so storage moves to
//   AsyncStorage - which is async, unlike localStorage's sync get/set. That
//   makes getToken/setToken/clearToken async here, which is why
//   applySession() in api/auth.tsx awaits them where the web version didn't.
// - "/api" was relative on the website because the browser fills in the
//   origin automatically. A native app has no origin to inherit, so BASE
//   has to be a full URL - see EXPO_PUBLIC_API_URL in .env.example
//   (host only, no trailing slash, no "/api" - it's added below).
// - The active clinic is read synchronously by the web version. Here it's
//   kept in an in-memory cache that mirrors AsyncStorage, so
//   getActiveClinicId() stays sync and request() just awaits the first load.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";

// RN's classic FormData "file part" hack - appending a plain {uri,name,type}
// object - is what every upload call here used to do, and is still what RN's
// own docs describe. On this project's setup (Hermes + New Architecture) it
// throws "Unsupported FormDataPart implementation" instead - the networking
// layer only recognises a real Blob-like object now, not that plain-object
// hack. expo-file-system's new File class IS Blob-like (download.ts already
// relies on this), so wrapping the uri in one is what actually gets
// accepted; the filename goes through FormData.append's own third argument
// rather than a property on the value.
function toFormFile(file: { uri: string }) {
  return new File(file.uri);
}

// Trailing slashes dropped - "http://host:8082/" + "/api" made "//api", which
// the server's /api route doesn't match.
const BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
if (!BASE) {
  // Fails loudly at startup rather than every request silently hitting
  // "undefined/api/..." - easy to miss otherwise.
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env.local and fill in your backend's address.",
  );
}

const TOKEN_KEY = "mxp_token";
const CLINIC_KEY = "mxp_clinic";

type Id = string | number;
type FilePart = { uri: string; name: string; type: string };

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string) {
  await AsyncStorage.setItem(TOKEN_KEY, t);
}
export async function clearToken() {
  // Reset the cache synchronously so nothing sends a stale clinic header
  // while the AsyncStorage removals are still in flight.
  activeClinicId = null;
  clinicLoaded = Promise.resolve(null);
  await AsyncStorage.multiRemove([TOKEN_KEY, CLINIC_KEY]);
}

// The clinic a staff member is working in right now (nav switcher). Sent on
// every request as X-Clinic-Id; the backend re-checks membership, so this is
// only a choice, never a permission.
let activeClinicId: string | null = null;
let clinicLoaded: Promise<string | null> = AsyncStorage.getItem(
  CLINIC_KEY,
).then(
  (v) => {
    activeClinicId = v;
    return v;
  },
  () => null,
);

export function getActiveClinicId() {
  return activeClinicId;
}
// Resolves once the saved clinic has been read from AsyncStorage.
export function loadActiveClinicId() {
  return clinicLoaded;
}
export async function setActiveClinicId(id: Id | null | undefined) {
  activeClinicId = id ? String(id) : null;
  clinicLoaded = Promise.resolve(activeClinicId);
  if (activeClinicId) await AsyncStorage.setItem(CLINIC_KEY, activeClinicId);
  else await AsyncStorage.removeItem(CLINIC_KEY);
}

type RequestOptions = {
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
};

async function request(
  method: string,
  path: string,
  { body, formData, query }: RequestOptions = {},
) {
  const url = new URL(BASE + "/api" + path);
  if (query) {
    Object.entries(query).forEach(
      ([k, v]) => v != null && url.searchParams.set(k, String(v)),
    );
  }

  const headers: Record<string, string> = {};
  const token = await getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  await clinicLoaded;
  if (activeClinicId) headers["X-Clinic-Id"] = activeClinicId;

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), { method, headers, body: payload });
  if (res.status === 204) return null;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) {
    const msg = (data && data.detail) || res.statusText;
    // FastAPI validation errors are a list of {loc, msg, ...}.
    if (Array.isArray(msg)) {
      throw new Error(
        msg.map((d: any) => d.msg || JSON.stringify(d)).join("; "),
      );
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  // auth
  async login(email: string, password: string) {
    const fd = new FormData();
    fd.append("username", email);
    fd.append("password", password);
    return request("POST", "/auth/login", { formData: fd });
  },
  async me() {
    return request("GET", "/users/me");
  },
  async forgotPassword(email: string) {
    return request("POST", "/auth/forgot-password", { body: { email } });
  },
  async resetPassword(token: string, new_password: string) {
    return request("POST", "/auth/reset-password", {
      body: { token, new_password },
    });
  },
  async phoneLoginStart(phone: string) {
    return request("POST", "/auth/phone/start", { body: { phone } });
  },
  async phoneLoginVerify(phone: string, otp: string) {
    return request("POST", "/auth/phone/verify", { body: { phone, otp } });
  },

  // patient voice UI strings + their spoken clips (see src/voice/speech.ts)
  async voicePrompts(lang: string) {
    return request("GET", "/voice-prompts", { query: { lang } });
  },
  voicePromptAudioUrl(key: string, lang: string, version: string | number) {
    return `${BASE}/api/voice-prompts/${encodeURIComponent(key)}/audio?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(String(version))}`;
  },

  // languages
  async languages() {
    return request("GET", "/languages");
  },

  // users
  async listPatients(includeInactive = false) {
    return request("GET", "/users/patients", {
      query: { include_inactive: includeInactive },
    });
  },
  // With a clinicId: doctors working at that clinic. Without: everyone in
  // the organization (e.g. for resolving names).
  async listDoctors(clinicId?: Id | null) {
    return request("GET", "/users/doctors", { query: { clinic_id: clinicId } });
  },
  async verifyStaff(id: Id) {
    return request("POST", `/users/${id}/verify`);
  },
  async setStaffActive(id: Id, active: boolean) {
    return request("POST", `/users/${id}/active`, { query: { active } });
  },

  // clinics
  async listClinics() {
    return request("GET", "/clinics");
  },
  async listStaff() {
    return request("GET", "/staff");
  },
  async createStaff(body: unknown) {
    return request("POST", "/staff", { body });
  },
  async updateStaff(id: Id, body: unknown) {
    return request("PATCH", `/staff/${id}`, { body });
  },
  async organizationStats() {
    return request("GET", "/clinics/stats");
  },
  async createClinic(body: unknown) {
    return request("POST", "/clinics", { body });
  },
  async updateClinic(id: Id, body: unknown) {
    return request("PATCH", `/clinics/${id}`, { body });
  },
  async clinicMembers(id: Id) {
    return request("GET", `/clinics/${id}/members`);
  },
  async clinicCandidates(id: Id) {
    return request("GET", `/clinics/${id}/candidates`);
  },
  async addClinicMember(id: Id, userId: Id) {
    return request("POST", `/clinics/${id}/members`, {
      body: { user_id: userId },
    });
  },
  async createClinicStaff(id: Id, body: unknown) {
    return request("POST", `/clinics/${id}/staff`, { body });
  },
  async removeClinicMember(id: Id, userId: Id) {
    return request("DELETE", `/clinics/${id}/members/${userId}`);
  },

  // doctor <-> assistant
  async listAssistants(doctorId?: Id) {
    return request("GET", "/assistants", { query: { doctor_id: doctorId } });
  },
  async availableAssistants(doctorId?: Id) {
    return request("GET", "/assistants/available", {
      query: { doctor_id: doctorId },
    });
  },
  async linkAssistant(body: unknown) {
    return request("POST", "/assistants", { body });
  },
  async unlinkAssistant(assistantId: Id, doctorId?: Id) {
    return request("DELETE", `/assistants/${assistantId}`, {
      query: { doctor_id: doctorId },
    });
  },
  async myDoctors() {
    return request("GET", "/assistants/my-doctors");
  },

  // assistant prescription review
  async myReviewQueue(includeDone = false) {
    return request("GET", "/prescription-reviews/mine", {
      query: { include_done: includeDone },
    });
  },
  async reviewsForConsultation(cid: Id) {
    return request("GET", `/prescription-reviews/consultation/${cid}`);
  },
  async sendToAssistant(cid: Id, body: unknown) {
    return request("POST", `/prescription-reviews/consultation/${cid}/send`, {
      body,
    });
  },
  async returnToDoctor(cid: Id, notes: string) {
    return request("POST", `/prescription-reviews/consultation/${cid}/return`, {
      body: { notes },
    });
  },
  async recallFromAssistant(cid: Id) {
    return request("POST", `/prescription-reviews/consultation/${cid}/recall`);
  },
  async createPatientByReceptionist(body: unknown) {
    return request("POST", "/users/patients", { body });
  },
  async updatePatientByReceptionist(id: Id, body: unknown) {
    return request("PATCH", `/users/patients/${id}`, { body });
  },
  async deactivatePatient(id: Id) {
    return request("POST", `/users/patients/${id}/deactivate`);
  },
  async reactivatePatient(id: Id) {
    return request("POST", `/users/patients/${id}/reactivate`);
  },

  // queue
  async addToQueue(body: unknown) {
    return request("POST", "/queue", { body });
  },
  async listQueue(doctorId?: Id) {
    return request("GET", "/queue", { query: { doctor_id: doctorId } });
  },
  async callQueueEntry(id: Id) {
    return request("POST", `/queue/${id}/call`);
  },
  async updateQueueStatus(id: Id, status: string) {
    return request("POST", `/queue/${id}/status`, { body: { status } });
  },
  async myQueueStatus() {
    return request("GET", "/queue/mine");
  },

  // appointments
  async getDoctorSchedule(doctorId: Id) {
    return request("GET", `/appointments/schedule/${doctorId}`);
  },
  async saveWeeklyHours(doctorId: Id, rows: unknown) {
    return request("PUT", `/appointments/schedule/${doctorId}`, {
      body: { rows },
    });
  },
  async setScheduleException(doctorId: Id, body: unknown) {
    return request("POST", `/appointments/schedule/${doctorId}/exceptions`, {
      body,
    });
  },
  async deleteScheduleException(id: Id) {
    return request("DELETE", `/appointments/schedule/exceptions/${id}`);
  },
  async getAvailability(doctorId: Id, date: string, clinicId?: Id | null) {
    return request("GET", "/appointments/availability", {
      query: { doctor_id: doctorId, date, clinic_id: clinicId },
    });
  },
  async bookAppointment(body: unknown) {
    return request("POST", "/appointments", { body });
  },
  async listAppointments(doctorId: Id | undefined, date: string) {
    return request("GET", "/appointments", {
      query: { doctor_id: doctorId, date },
    });
  },
  async myAppointments() {
    return request("GET", "/appointments/mine");
  },
  async cancelAppointment(id: Id) {
    return request("POST", `/appointments/${id}/cancel`);
  },
  async linkAppointment(id: Id, patientId: Id) {
    return request("POST", `/appointments/${id}/link`, {
      body: { patient_id: patientId },
    });
  },
  async checkInAppointment(id: Id) {
    return request("POST", `/appointments/${id}/check-in`);
  },
  async markNoShow(id: Id) {
    return request("POST", `/appointments/${id}/no-show`);
  },
  async updateProfile(body: unknown) {
    return request("PATCH", "/users/me", { body });
  },
  async changePassword(current_password: string, new_password: string) {
    return request("POST", "/users/me/password", {
      body: { current_password, new_password },
    });
  },

  // consultations
  async createConsultation(body: unknown) {
    return request("POST", "/consultations/", { body });
  },
  async uploadAudio(id: Id, file: FilePart) {
    const fd = new FormData();
    fd.append("file", toFormFile(file) as any, file.name);
    return request("POST", `/consultations/${id}/audio`, { formData: fd });
  },
  async uploadPrescription(id: Id, file: FilePart) {
    const fd = new FormData();
    fd.append("file", toFormFile(file) as any, file.name);
    return request("POST", `/consultations/${id}/prescription`, {
      formData: fd,
    });
  },
  async getConsultation(id: Id) {
    return request("GET", `/consultations/${id}`);
  },
  async listConsultations(status?: string) {
    return request("GET", "/consultations/", { query: { status } });
  },
  async approve(id: Id, body: unknown) {
    return request("POST", `/consultations/${id}/approve`, { body });
  },
  async release(id: Id) {
    return request("POST", `/consultations/${id}/release`);
  },
  async setNextVisit(id: Id, next_visit_date: string) {
    return request("PATCH", `/consultations/${id}/next-visit`, {
      body: { next_visit_date },
    });
  },
  async setReportRequest(id: Id, note: string) {
    return request("PATCH", `/consultations/${id}/report-request`, {
      body: { note },
    });
  },
  async uploadReport(id: Id, file: FilePart) {
    const fd = new FormData();
    fd.append("file", toFormFile(file) as any, file.name);
    return request("POST", `/consultations/${id}/report`, { formData: fd });
  },
  async markReportReviewed(id: Id) {
    return request("POST", `/consultations/${id}/report/reviewed`);
  },
  async setBillItems(id: Id, items: unknown) {
    return request("PATCH", `/consultations/${id}/bill`, { body: { items } });
  },
  billUrl(id: Id) {
    return `${BASE}/api/consultations/${id}/bill`;
  },
  async retranslate(id: Id, target_lang: string) {
    return request("POST", `/consultations/${id}/translate`, {
      query: { target_lang },
    });
  },
  async deleteConsultation(id: Id) {
    return request("DELETE", `/consultations/${id}`);
  },
  async retryPipeline(id: Id) {
    return request("POST", `/consultations/${id}/retry`);
  },
  async createShareLink(id: Id, phone: string) {
    return request("POST", `/consultations/${id}/share`, { query: { phone } });
  },
  audioSummaryUrl(id: Id) {
    return `${BASE}/api/consultations/${id}/audio-summary`;
  },
  pdfUrl(id: Id) {
    return `${BASE}/api/consultations/${id}/pdf`;
  },

  // cross-check
  async requestCrossCheck(body: unknown) {
    return request("POST", "/cross-check/request", { body });
  },
  async submitCrossCheck(id: Id, body: unknown) {
    return request("POST", `/cross-check/${id}/submit`, { body });
  },
  async pendingCrossChecks() {
    return request("GET", "/cross-check/pending");
  },
  async crossChecksForConsultation(cid: Id) {
    return request("GET", `/cross-check/for-consultation/${cid}`);
  },

  // medications
  async suggestMedications(query: string, top_k = 5) {
    return request("GET", "/medications/suggest", {
      query: { q: query, top_k },
    });
  },
  async listAllMedications() {
    return request("GET", "/medications/all");
  },
  async updateMedication(cid: Id, idx: number, body: unknown) {
    return request("POST", `/consultations/${cid}/medications/${idx}`, {
      body,
    });
  },
  async removeMedication(cid: Id, idx: number) {
    return request("DELETE", `/consultations/${cid}/medications/${idx}`);
  },
  async addMedication(cid: Id, body: unknown) {
    return request("POST", `/consultations/${cid}/medications`, { body });
  },

  // transcript / safety
  async transcriptSegments(id: Id) {
    return request("GET", `/consultations/${id}/transcript-segments`);
  },
  async updateTranscriptSegment(cid: Id, sid: Id, body: unknown) {
    return request(
      "PATCH",
      `/consultations/${cid}/transcript-segments/${sid}`,
      { body },
    );
  },
  async regenerateReviewedTranscript(id: Id) {
    return request("POST", `/consultations/${id}/regenerate-reviewed`);
  },
  async safetyChecks(id: Id) {
    return request("GET", `/consultations/${id}/safety`);
  },
  async resolveSafety(
    cid: Id,
    checkId: Id,
    { confirmTranslation = false, confirmGrounding = false } = {},
  ) {
    const params = new URLSearchParams();
    if (confirmTranslation) params.set("confirm_translation", "true");
    if (confirmGrounding) params.set("confirm_grounding", "true");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(
      "POST",
      `/consultations/${cid}/safety/${checkId}/resolve${suffix}`,
    );
  },
  async correctPrescriptionOcr(cid: Id, text: string) {
    return request("PATCH", `/consultations/${cid}/prescription/ocr`, {
      body: { text },
    });
  },
  async generateSchedules(cid: Id) {
    return request("POST", `/schedules/consultation/${cid}/generate`);
  },
  async schedulesForConsultation(cid: Id) {
    return request("GET", `/schedules/consultation/${cid}`);
  },
  async mySchedules() {
    return request("GET", "/schedules/mine");
  },
  async medicationEventAction(
    eventId: Id,
    action: string,
    snooze_minutes = 15,
  ) {
    return request("POST", `/schedules/events/${eventId}/action`, {
      body: { action, snooze_minutes },
    });
  },
  medicationEventAudioUrl(eventId: Id) {
    return `${BASE}/api/schedules/events/${eventId}/audio`;
  },

  // voice assistant (patient)
  async voiceQuery(file: FilePart) {
    const fd = new FormData();
    fd.append("file", toFormFile(file) as any, file.name);
    return request("POST", "/patient/voice-query", { formData: fd });
  },
  prescriptionAudioUrl(cid: Id) {
    return `${BASE}/api/consultations/${cid}/prescription-audio`;
  },
  adviceAudioUrl(cid: Id) {
    return `${BASE}/api/consultations/${cid}/advice-audio`;
  },
  symptomsAudioUrl(cid: Id) {
    return `${BASE}/api/consultations/${cid}/symptoms-audio`;
  },
  medicineAudioUrl(cid: Id, mid: Id) {
    return `${BASE}/api/consultations/${cid}/medicine-audio/${mid}`;
  },

  // public share (no auth needed)
  async getSharedView(token: string) {
    const r = await fetch(`${BASE}/api/share/${token}`);
    if (!r.ok) throw new Error((await r.json()).detail || r.statusText);
    return r.json();
  },
  sharedAudioUrl(token: string) {
    return `${BASE}/api/share/${token}/audio`;
  },
  sharedPdfUrl(token: string) {
    return `${BASE}/api/share/${token}/pdf`;
  },
};
