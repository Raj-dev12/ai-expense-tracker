/**
 * Turning stored strings into things people read.
 *
 * Amounts arrive as strings, exactly as the database holds them, so no precision
 * is lost on the way. This is the one place they become numbers, and it happens
 * at the last possible moment: for display, and for the charts.
 *
 * The currency is passed in rather than fixed, because the base currency is a
 * setting now. The formatters are cached per currency: building an
 * Intl.NumberFormat is not free, and the charts format every tick and every
 * tooltip.
 */

const full = new Map<string, Intl.NumberFormat>();
const short = new Map<string, Intl.NumberFormat>();

function formatter(cache: Map<string, Intl.NumberFormat>, currency: string, digits: number) {
  const existing = cache.get(currency);
  if (existing) return existing;

  const made = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
  });
  cache.set(currency, made);
  return made;
}

export function formatMoney(value: string | number, currency: string): string {
  return formatter(full, currency, 2).format(Number(value));
}

/** Axis ticks have no room for cents. */
export function formatMoneyShort(value: number, currency: string): string {
  return formatter(short, currency, 0).format(value);
}

/**
 * Today, in this browser's time zone, as YYYY-MM-DD.
 *
 * "en-CA" formats dates in exactly that shape, which is the same trick the
 * backend uses. Building it from the local parts rather than slicing an ISO
 * string matters: `toISOString()` is UTC, so late in the evening east of
 * Greenwich it names tomorrow.
 */
const isoDay = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayIso(): string {
  return isoDay.format(new Date());
}

/** "2026-08-24" becomes "Monday, 24 August". */
const fullDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatFullDay(iso: string): string {
  return fullDay.format(new Date(`${iso}T00:00:00Z`));
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "2026-08-24" becomes "24 Aug". Parsed as UTC so the day never shifts. */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** "2026-09-01" becomes "September 2026". The calendar's own heading. */
export function formatMonthYear(iso: string): string {
  return monthYear.format(new Date(`${iso}T00:00:00Z`));
}

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" });

export function formatMonth(iso: string): string {
  return monthName.format(new Date(`${iso}T00:00:00Z`));
}
