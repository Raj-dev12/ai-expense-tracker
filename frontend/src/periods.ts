import { todayIso } from "./format";

/**
 * The seven periods the dashboard can be looked at through.
 *
 * **Calendar, not rolling.** "This quarter" means the quarter you are standing
 * in — 1 July to today — not the last ninety days. That is how people talk about
 * a quarter or a year, and it is the only reading that lets one period line up
 * with the one before it. Rolling windows smooth noise, which is a different job
 * from the one this dashboard has.
 *
 * The current period runs from the start of its calendar block to *today*, never
 * to the block's end: a quarter is two months old on 31 August, and drawing it as
 * though it ran to 30 September would show a third of it as empty.
 *
 * A **stepped** period is different, and deliberately so. Once you step back,
 * August means the whole of August — 1 to 31 — because that month is over and
 * there is nothing to be partial about. It is also what makes the comparison
 * honest: a complete August against a complete July is like for like, where
 * "1 August to today's date" against the same length before it would compare a
 * calendar accident with another one.
 *
 * One consequence worth expecting rather than reporting as a bug: on some dates
 * several of these coincide. On 31 August 2026 the quarter and the half year
 * both begin on 1 July, because the second half starts when the third quarter
 * does. They are different questions with the same answer that day.
 */
export const PERIODS = [
  "day",
  "week",
  "month",
  "quarter",
  "half",
  "threeQuarters",
  "year",
] as const;

export type Period = (typeof PERIODS)[number];

/**
 * What the dashboard is currently showing.
 *
 * Either one of the named periods, stepped back by `offset` blocks, or a range
 * somebody typed in. `offset` is zero or negative — there is no spending in the
 * future, so the forward arrow stops at the present rather than wrapping.
 */
export type Selection =
  | { kind: "period"; period: Period; offset: number }
  | { kind: "custom"; from: string; to: string };

export const THIS_MONTH: Selection = { kind: "period", period: "month", offset: 0 };

/**
 * The same seven periods as a noun phrase, for dropping into a sentence.
 *
 * "This month" is right in a menu and wrong in "Spent This month", and "Today"
 * has to lose its "this" entirely. Two lists rather than one lowercasing hack,
 * because the difference is grammar rather than case.
 */
export const PERIOD_NOUNS: Record<Period, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  quarter: "this quarter",
  half: "this half year",
  threeQuarters: "these three quarters",
  year: "this year",
};

export const PERIOD_LABELS: Record<Period, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  half: "This half year",
  threeQuarters: "Last three quarters",
  year: "This year",
};

function parts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Move a year and month by a number of months, without going near a Date.
 *
 * `setMonth` on a Date is a trap here: 31 March minus one month is 3 March,
 * because February has no 31st and JavaScript rolls over rather than clamping.
 * Every block this file steps begins on the 1st, so working in whole months and
 * only then attaching a day avoids the question entirely.
 */
function shiftMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  // The modulo has to be made positive by hand: -1 % 12 is -1 in JavaScript,
  // which would put December in month zero of the wrong year.
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

function lastDayOfMonth(year: number, month: number): number {
  // Day zero of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: string, days: number): string {
  const { year, month, day } = parts(date);
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * The Monday of the week a date falls in.
 *
 * Monday, matching the trend chart, which buckets with PostgreSQL's
 * `date_trunc('week', ...)` — and that starts weeks on Monday. A week that began
 * on Sunday here would put the same expense in a different bucket from the one
 * the chart draws it in.
 */
function startOfWeek(date: string): string {
  const { year, month, day } = parts(date);
  const at = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay is 0 for Sunday, so Sunday goes back six days rather than none.
  at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  return at.toISOString().slice(0, 10);
}

/** The first day of the calendar quarter a date falls in: 1 Jan, 1 Apr, 1 Jul, 1 Oct. */
function startOfQuarter(date: string): string {
  const { year, month } = parts(date);
  return iso(year, month - ((month - 1) % 3), 1);
}

/**
 * How far one step of the arrows moves, in months — or in days for the two
 * periods that are not measured in months.
 *
 * `threeQuarters` steps by a single quarter rather than by its own nine-month
 * length, because it is the one period here that does not tile the calendar: it
 * is a window three quarters wide, and sliding it a quarter at a time is what
 * anybody pressing "back" on it means.
 */
const STEP_MONTHS: Record<Period, number> = {
  day: 0,
  week: 0,
  month: 1,
  quarter: 3,
  half: 6,
  threeQuarters: 3,
  year: 12,
};

/** The date inside the block an offset lands on. */
function anchorFor(period: Period, today: string, offset: number): string {
  if (period === "day") return addDays(today, offset);
  if (period === "week") return addDays(today, offset * 7);

  const { year, month, day } = parts(today);
  const moved = shiftMonths(year, month, offset * STEP_MONTHS[period]);
  // Clamped so stepping back from the 31st does not skip a short month.
  return iso(moved.year, moved.month, Math.min(day, lastDayOfMonth(moved.year, moved.month)));
}

/** Where the block containing a date begins. */
function startOfBlock(period: Period, anchor: string): string {
  const { year, month } = parts(anchor);

  switch (period) {
    case "day":
      return anchor;
    case "week":
      return startOfWeek(anchor);
    case "month":
      return iso(year, month, 1);
    case "quarter":
      return startOfQuarter(anchor);
    case "half":
      // The second half starts in July; the first in January.
      return iso(year, month <= 6 ? 1 : 7, 1);
    case "threeQuarters": {
      // This quarter and the two before it, still landing on a quarter
      // boundary — so in Q3 it starts on 1 January, not on some date nine
      // months back.
      const { year: qy, month: qm } = parts(startOfQuarter(anchor));
      const back = shiftMonths(qy, qm, -6);
      return iso(back.year, back.month, 1);
    }
    case "year":
      return iso(year, 1, 1);
  }
}

/** Where the block containing a date ends. Only used once a period is in the past. */
function endOfBlock(period: Period, anchor: string): string {
  const { year, month } = parts(anchor);

  switch (period) {
    case "day":
      return anchor;
    case "week":
      return addDays(startOfWeek(anchor), 6);
    case "month":
      return iso(year, month, lastDayOfMonth(year, month));
    case "quarter":
    case "threeQuarters": {
      // Both end where the anchor's quarter ends; they differ only in where
      // they start.
      const { year: qy, month: qm } = parts(startOfQuarter(anchor));
      const end = shiftMonths(qy, qm, 2);
      return iso(end.year, end.month, lastDayOfMonth(end.year, end.month));
    }
    case "half": {
      const endMonth = month <= 6 ? 6 : 12;
      return iso(year, endMonth, lastDayOfMonth(year, endMonth));
    }
    case "year":
      return iso(year, 12, 31);
  }
}

/** The window a period covers, ending today. Kept for callers that never step. */
export function windowFor(period: Period, today = todayIso()): { from: string; to: string } {
  return windowForSelection({ kind: "period", period, offset: 0 }, today);
}

/**
 * The window a selection covers.
 *
 * The current block runs to today; a stepped one runs to the block's own end.
 * That difference is the whole reason stepping is worth having — see the note at
 * the top of this file.
 */
export function windowForSelection(
  selection: Selection,
  today = todayIso(),
): { from: string; to: string } {
  if (selection.kind === "custom") return { from: selection.from, to: selection.to };

  const anchor = anchorFor(selection.period, today, selection.offset);
  return {
    from: startOfBlock(selection.period, anchor),
    to: selection.offset === 0 ? today : endOfBlock(selection.period, anchor),
  };
}

/** Whether the arrows can move from here. Forward stops at the present. */
export function canStepForward(selection: Selection): boolean {
  return selection.kind === "period" && selection.offset < 0;
}

export function step(selection: Selection, by: -1 | 1): Selection {
  if (selection.kind !== "period") return selection;
  const offset = Math.min(0, selection.offset + by);
  return { ...selection, offset };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(date: string): string {
  const { year, month, day } = parts(date);
  return `${day} ${SHORT_MONTHS[month - 1]} ${year}`;
}

function quarterName(date: string): string {
  const { year, month } = parts(date);
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

/**
 * What to call the selected window.
 *
 * Absolute names once stepped, never relative ones. "Last month" is readable
 * exactly once; "three months ago" is arithmetic, and "three quarters ago"
 * collides with the period actually called three quarters. A name like "August
 * 2026" can be checked against a calendar, which is the same reason the
 * comparison note names the window it compared against rather than describing
 * it in prose.
 */
export function selectionLabel(selection: Selection, today = todayIso()): string {
  if (selection.kind === "custom") {
    // The year is written once when both ends share it: "1 Jun – 15 Jul 2026"
    // rather than the same four digits twice in one label.
    const sameYear = selection.from.slice(0, 4) === selection.to.slice(0, 4);
    const start = sameYear ? shortDate(selection.from).replace(/ \d{4}$/, "") : shortDate(selection.from);
    return `${start} – ${shortDate(selection.to)}`;
  }

  if (selection.offset === 0) return PERIOD_LABELS[selection.period];

  const { from, to } = windowForSelection(selection, today);
  const { year, month } = parts(from);

  switch (selection.period) {
    case "day":
      return shortDate(from);
    case "week":
      return `Week of ${shortDate(from)}`;
    case "month":
      return `${MONTH_NAMES[month - 1]} ${year}`;
    case "quarter":
      return quarterName(from);
    case "half":
      return `${month <= 6 ? "H1" : "H2"} ${year}`;
    case "threeQuarters":
      return `${quarterName(from)} – ${quarterName(to)}`;
    case "year":
      return String(year);
  }
}

/**
 * The same window as a phrase that can follow "Spent".
 *
 * The current period keeps the wording it always had, so nothing on an
 * unstepped dashboard reads differently from before. A stepped one needs a
 * preposition, for the same grammar reason `PERIOD_NOUNS` exists at all.
 */
export function selectionPhrase(selection: Selection, today = todayIso()): string {
  if (selection.kind === "custom") {
    return `from ${shortDate(selection.from)} to ${shortDate(selection.to)}`;
  }

  if (selection.offset === 0) return PERIOD_NOUNS[selection.period];

  const label = selectionLabel(selection, today);
  // A single day takes "on"; a week reads as "in the week of ...", which is why
  // the label and the phrase are not simply the same string with a preposition
  // glued on the front.
  if (selection.period === "day") return `on ${label}`;
  if (selection.period === "week") return `in the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  return `in ${label}`;
}

/**
 * The window's name as it reads after "Summarise".
 *
 * The unstepped noun ("this month") or the block's own name ("August 2026").
 * Not `selectionPhrase`, whose preposition would make "Summarise in August".
 */
export function selectionShortName(selection: Selection, today = todayIso()): string {
  if (selection.kind === "period" && selection.offset === 0) return PERIOD_NOUNS[selection.period];
  return selectionLabel(selection, today);
}

/** How many weeks the trend line draws, matching the backend's own default. */
const TREND_WEEKS = 14;

/**
 * The window the trend line covers for a given selection.
 *
 * Fourteen weeks wide whatever the period is, but ending where the period ends
 * rather than always at today. That is the compromise between the two wrong
 * answers: pinning it to today leaves one chart on a July dashboard describing
 * September, and squeezing it into the period would draw "today" as a single
 * point and a week as two.
 */
export function trendWindowFor(selection: Selection, today = todayIso()): {
  from: string;
  to: string;
} {
  const { to } = windowForSelection(selection, today);
  return { from: addDays(startOfWeek(to), -7 * (TREND_WEEKS - 1)), to };
}
