// Appointment times from the API are naive clinic wall-clock times
// (Asia/Karachi), e.g. "2026-09-26T17:15:00". They're formatted by slicing
// the string rather than via `new Date()`, which would shift them by the
// viewer's own timezone offset.

export const CLINIC_TZ = "Asia/Karachi";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const selectClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent";

export function clinicToday() {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ }).format(
    new Date(),
  );
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatTime(iso) {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDate(isoDate) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export const APPT_STATUS_STYLE = {
  booked: "bg-sky-100 text-sky-800",
  checked_in: "bg-emerald-100 text-emerald-800",
  no_show: "bg-amber-100 text-amber-800",
  cancelled: "bg-slate-100 text-slate-500",
};
