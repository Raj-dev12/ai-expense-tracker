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

/**
 * "2026-08-01" → "August 2026".
 *
 * For prose only. Everything stored or compared uses the ISO form; this exists
 * because a summary that begins "In 2026-08-01 you spent" is a sentence no
 * person would write.
 */
const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function monthLabel(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return monthLabelFormatter.format(new Date(Date.UTC(year!, month! - 1, 1)));
}

/** Shift a YYYY-MM-DD date by a number of days. Negative goes backwards. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function format(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first of the month a date falls in. */
export function startOfMonth(iso: string): string {
  const { year, month } = parts(iso);
  return format(year, month, 1);
}

/** The first of the month before the one a date falls in. */
export function startOfPreviousMonth(iso: string): string {
  const { year, month } = parts(iso);
  return month === 1 ? format(year - 1, 12, 1) : format(year, month - 1, 1);
}

/** How many days the month containing this date has. */
export function daysInMonth(iso: string): number {
  const { year, month } = parts(iso);
  // Day zero of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which day of the month this is: 1 to 31. */
export function dayOfMonth(iso: string): number {
  return parts(iso).day;
}

/**
 * The Monday of the week a date falls in.
 *
 * Weeks start on Monday here, which is the European convention and the one
 * PostgreSQL's `date_trunc('week', ...)` also uses — so the buckets built in
 * JavaScript line up exactly with the ones the database groups by.
 */
export function startOfWeek(iso: string): string {
  const { year, month, day } = parts(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay is 0 for Sunday, so Sunday needs to go back six days, not none.
  const weekday = date.getUTCDay();
  return addDays(iso, -((weekday + 6) % 7));
}

/** Every Monday from the week containing `from` up to the week containing `to`. */
export function weekStartsBetween(from: string, to: string): string[] {
  const weeks: string[] = [];
  let cursor = startOfWeek(from);
  const last = startOfWeek(to);
  while (cursor <= last) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
