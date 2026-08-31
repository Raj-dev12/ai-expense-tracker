/**
 * Turning stored strings into things people read.
 *
 * Amounts arrive as strings, exactly as the database holds them, so no precision
 * is lost on the way. This is the one place they become numbers, and it happens
 * at the last possible moment: for display, and for the charts.
 */

const euros = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const wholeEuros = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEur(value: string | number): string {
  return euros.format(Number(value));
}

/** Axis ticks have no room for cents. */
export function formatEurShort(value: number): string {
  return wholeEuros.format(value);
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "2026-08-24" becomes "24 Aug". Parsed as UTC so the day never shifts. */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" });

export function formatMonth(iso: string): string {
  return monthName.format(new Date(`${iso}T00:00:00Z`));
}
