// Every date decision in the app goes through this file.
//
// Containers run on UTC unless told otherwise, so an expense entered at 11pm in
// Helsinki would otherwise be filed under tomorrow. Rather than trusting the
// machine's clock settings, the time zone is named explicitly here and used for
// every "what day is it" question.
export const APP_TIME_ZONE = "Europe/Helsinki";

// "en-CA" is a small trick: that locale formats dates as YYYY-MM-DD, which is
// exactly the format PostgreSQL wants for a `date` column.
const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in the app's time zone, as YYYY-MM-DD. */
export function todayIso(): string {
  return isoDateFormatter.format(new Date());
}

/** Shift a YYYY-MM-DD date by a number of days. Negative goes backwards. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
