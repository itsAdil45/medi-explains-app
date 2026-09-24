// Thin wrapper around fetch, mimicking the website's api/client.js.
// Adds the JWT, decodes JSON, raises on non-2xx.
//
// Two things can't carry over as-is from the web version:
// - localStorage doesn't exist in React Native, so token storage moves to
//   AsyncStorage - which is async, unlike localStorage's sync get/set. That
//   makes getToken/setToken/clearToken async here, which is why
//   applySession() in api/auth.tsx awaits them where the web version didn't.
// - "/api" was relative on the website because the browser fills in the
//   origin automatically. A native app has no origin to inherit, so BASE
//   has to be a full URL - see EXPO_PUBLIC_API_URL in .env.example.
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_API_URL;
if (!BASE) {
  // Fails loudly at startup rather than every request silently hitting
  // "undefined/api/..." - easy to miss otherwise.
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env.local and fill in your backend's address.",
  );
}

const TOKEN_KEY = "mxp_token";

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string) {
  await AsyncStorage.setItem(TOKEN_KEY, t);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

type RequestOptions = {
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
};

async function request(method: string, path: string, { body, formData, query }: RequestOptions = {}) {
  const url = new URL(BASE + "/api" + path);
  if (query) {
    Object.entries(query).forEach(
      ([k, v]) => v != null && url.searchParams.set(k, String(v)),
    );
  }

  const headers: Record<string, string> = {};
  const token = await getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

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
  async listDoctors() {
    return request("GET", "/users/doctors");
  },
  async createPatientByReceptionist(body: unknown) {
    return request("POST", "/users/patients", { body });
  },
  async updatePatientByReceptionist(id: string, body: unknown) {
    return request("PATCH", `/users/patients/${id}`, { body });
  },
  async deactivatePatient(id: string) {
    return request("POST", `/users/patients/${id}/deactivate`);
  },
  async reactivatePatient(id: string) {
    return request("POST", `/users/patients/${id}/reactivate`);
  },

  // queue
  async addToQueue(body: unknown) {
    return request("POST", "/queue", { body });
  },
  async listQueue(doctorId: string) {
    return request("GET", "/queue", { query: { doctor_id: doctorId } });
  },
  async callQueueEntry(id: string) {
    return request("POST", `/queue/${id}/call`);
  },
  async updateQueueStatus(id: string, status: string) {
    return request("POST", `/queue/${id}/status`, { body: { status } });
  },
  async myQueueStatus() {
    return request("GET", "/queue/mine");
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
  async uploadAudio(id: string, file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    // @ts-expect-error RN's FormData accepts {uri,name,type} file parts, unlike DOM's File/Blob
    fd.append("file", file);
    return request("POST", `/consultations/${id}/audio`, { formData: fd });
  },
  async uploadPrescription(id: string, file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    // @ts-expect-error see uploadAudio
    fd.append("file", file);
    return request("POST", `/consultations/${id}/prescription`, {
      formData: fd,
    });
  },
  async getConsultation(id: string) {
    return request("GET", `/consultations/${id}`);
  },
  async listConsultations(status?: string) {
    return request("GET", "/consultations/", { query: { status } });
  },
  async approve(id: string, body: unknown) {
    return request("POST", `/consultations/${id}/approve`, { body });
  },
  async release(id: string) {
    return request("POST", `/consultations/${id}/release`);
  },
  async setNextVisit(id: string, next_visit_date: string) {
    return request("PATCH", `/consultations/${id}/next-visit`, {
      body: { next_visit_date },
    });
  },
  async setReportRequest(id: string, note: string) {
    return request("PATCH", `/consultations/${id}/report-request`, {
      body: { note },
    });
  },
  async uploadReport(id: string, file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    // @ts-expect-error see uploadAudio
    fd.append("file", file);
    return request("POST", `/consultations/${id}/report`, { formData: fd });
  },
  async markReportReviewed(id: string) {
    return request("POST", `/consultations/${id}/report/reviewed`);
  },
  async setBillItems(id: string, items: unknown) {
    return request("PATCH", `/consultations/${id}/bill`, { body: { items } });
  },
  billUrl(id: string) {
    return `${BASE}/api/consultations/${id}/bill`;
  },
  async retranslate(id: string, target_lang: string) {
    return request("POST", `/consultations/${id}/translate`, {
      query: { target_lang },
    });
  },
  async deleteConsultation(id: string) {
    return request("DELETE", `/consultations/${id}`);
  },
  async retryPipeline(id: string) {
    return request("POST", `/consultations/${id}/retry`);
  },
  async createShareLink(id: string, phone: string) {
    return request("POST", `/consultations/${id}/share`, { query: { phone } });
  },
  audioSummaryUrl(id: string) {
    return `${BASE}/api/consultations/${id}/audio-summary`;
  },
  pdfUrl(id: string) {
    return `${BASE}/api/consultations/${id}/pdf`;
  },

  // cross-check
  async requestCrossCheck(body: unknown) {
    return request("POST", "/cross-check/request", { body });
  },
  async submitCrossCheck(id: string, body: unknown) {
    return request("POST", `/cross-check/${id}/submit`, { body });
  },
  async pendingCrossChecks() {
    return request("GET", "/cross-check/pending");
  },
  async crossChecksForConsultation(cid: string) {
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
  async updateMedication(cid: string, idx: number, body: unknown) {
    return request("POST", `/consultations/${cid}/medications/${idx}`, {
      body,
    });
  },
  async removeMedication(cid: string, idx: number) {
    return request("DELETE", `/consultations/${cid}/medications/${idx}`);
  },
  async addMedication(cid: string, body: unknown) {
    return request("POST", `/consultations/${cid}/medications`, { body });
  },

  // transcript / safety
  async transcriptSegments(id: string) {
    return request("GET", `/consultations/${id}/transcript-segments`);
  },
  async updateTranscriptSegment(cid: string, sid: string, body: unknown) {
    return request(
      "PATCH",
      `/consultations/${cid}/transcript-segments/${sid}`,
      { body },
    );
  },
  async regenerateReviewedTranscript(id: string) {
    return request("POST", `/consultations/${id}/regenerate-reviewed`);
  },
  async safetyChecks(id: string) {
    return request("GET", `/consultations/${id}/safety`);
  },
  async resolveSafety(
    cid: string,
    checkId: string,
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
  async correctPrescriptionOcr(cid: string, text: string) {
    return request("PATCH", `/consultations/${cid}/prescription/ocr`, {
      body: { text },
    });
  },
  async generateSchedules(cid: string) {
    return request("POST", `/schedules/consultation/${cid}/generate`);
  },
  async schedulesForConsultation(cid: string) {
    return request("GET", `/schedules/consultation/${cid}`);
  },
  async mySchedules() {
    return request("GET", "/schedules/mine");
  },
  async medicationEventAction(eventId: string, action: string, snooze_minutes = 15) {
    return request("POST", `/schedules/events/${eventId}/action`, {
      body: { action, snooze_minutes },
    });
  },
  medicationEventAudioUrl(eventId: string) {
    return `${BASE}/api/schedules/events/${eventId}/audio`;
  },

  // voice assistant (patient)
  async voiceQuery(file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    // @ts-expect-error see uploadAudio
    fd.append("file", file);
    return request("POST", "/patient/voice-query", { formData: fd });
  },
  prescriptionAudioUrl(cid: string) {
    return `${BASE}/api/consultations/${cid}/prescription-audio`;
  },
  adviceAudioUrl(cid: string) {
    return `${BASE}/api/consultations/${cid}/advice-audio`;
  },
  symptomsAudioUrl(cid: string) {
    return `${BASE}/api/consultations/${cid}/symptoms-audio`;
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
