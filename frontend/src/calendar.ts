import { addDays, shiftMonths, startOfWeek } from "./periods";

/**
 * The shape of a month grid: which dates go in which cells.
 *
 * Kept apart from the component that draws it so the arithmetic can be checked
 * on its own — a grid that puts the 1st in the wrong column is a bug you can
 * only see by counting squares on a screen, and this way it can be counted in a
 * check instead.
 *
 * The date helpers come from `periods.ts` rather than being written again here.
 * There are already two copies of this arithmetic in the repository, one in the
 * browser and one on the server; a third would be one more place for a leap year
 * to be handled differently.
 */

/**
 * Always six rows, never five.
 *
 * A month needs five or six depending on which weekday it starts on, and letting
 * the count follow the month would make the card change height every time the
 * arrows are pressed — which is the one control guaranteed to be pressed
 * repeatedly. A sixth row of faint next-month dates is the cheaper cost.
 */
export const WEEKS_SHOWN = 6;

export const DAYS_IN_WEEK = 7;

/**
 * Monday first, matching the trend chart and PostgreSQL's `date_trunc('week')`.
 *
 * Two letters rather than three: the columns are narrow, and "Mo Tu We" is
 * unambiguous once they are in a row under a calendar.
 */
export const WEEKDAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/**
 * The first of the month a date falls in.
 *
 * ISO dates are fixed width, so this is a slice rather than arithmetic. Every
 * other function here takes one of these — a month is represented by its own
 * first day, so there is no second kind of date string to keep straight.
 */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Move to the first of another month. Negative goes backwards. */
export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const moved = shiftMonths(year!, index!, by);
  return `${moved.year}-${String(moved.month).padStart(2, "0")}-01`;
}

/** The last day of a month, which is the day before the next month starts. */
export function endOfMonth(month: string): string {
  return addDays(shiftMonth(month, 1), -1);
}

/**
 * The window to ask the API for when showing a month.
 *
 * The end is clamped to today, which is not a detail about this component but
 * the rule the whole app already follows: `windowForSelection` ends the current
 * period at today rather than at its block's end, and the API refuses a future
 * date in a filter outright — `isoDateSchema` treats one as a mistake, which for
 * an expense date it is. Asking for "1 to 30 September" on the 9th is answered
 * with a validation error, not a month.
 *
 * Nothing is lost by clamping: there is no spending in the future, so the days
 * past today would have come back empty anyway, and the grid draws them as empty
 * either way.
 */
export function monthWindow(month: string, today: string): { from: string; to: string } {
  const end = endOfMonth(month);
  return { from: month, to: end < today ? end : today };
}

/** Whether a date belongs to the month being shown, or to a neighbour. */
export function isInMonth(date: string, month: string): boolean {
  return date.slice(0, 7) === month.slice(0, 7);
}

/** "2026-09-14" → 14. The number written in a cell. */
export function dayNumber(date: string): number {
  return Number(date.slice(8, 10));
}

/**
 * The forty-two dates a month's grid holds, in reading order.
 *
 * It starts on the Monday of the week the 1st falls in, which is usually in the
 * previous month, and runs six full weeks from there. The leading and trailing
 * dates are real dates rather than blanks: the grid keeps its shape at the
 * corners, and the eye finds the start of the month without counting.
 */
export function monthGrid(month: string): string[] {
  const first = startOfWeek(startOfMonth(month));
  return Array.from({ length: WEEKS_SHOWN * DAYS_IN_WEEK }, (_, index) => addDays(first, index));
}
