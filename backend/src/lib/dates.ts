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

/** How many calendar days a window covers, counting both ends. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy!, fm! - 1, fd!);
  const end = Date.UTC(ty!, tm! - 1, td!);
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * A window as a person would say it.
 *
 * "August 2026" when the window starts on the first of a month and ends inside
 * the same one — the common case, and it reads far better than a range.
 *
 * The label carries its own preposition — "In August 2026", "On 31 August 2026",
 * "In the period 1 July to 31 August 2026" — because the right one depends on
 * the window. A single day takes "on", a month takes "in", and a caller that had
 * to guess would get one of the three wrong. The label exists to be dropped into
 * a sentence, so fitting the sentence is its job.
 */
export function windowLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);

  // One day: "On 31 August 2026".
  if (from === to) {
    const [y, m, d] = from.split("-").map(Number);
    return `On ${new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Date.UTC(y!, m! - 1, d!)))}`;
  }

  // A whole or partial calendar month: "In August 2026".
  if (fd === 1 && fy === ty && fm === tm) return `In ${monthLabel(from)}`;

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return day.format(new Date(Date.UTC(y!, m! - 1, d!)));
  };

  return `In the period ${at(from)} to ${at(to)}`;
}

/** "2026-08-24" becomes "24 August 2026". For prose, never for storage. */
const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return dayLabelFormatter.format(new Date(Date.UTC(year!, month! - 1, day!)));
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
