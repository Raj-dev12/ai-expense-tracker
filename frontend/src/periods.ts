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
 * Every period runs from the start of its calendar block to *today*, never to
 * the block's end: a quarter is two months old on 31 August, and drawing it as
 * though it ran to 30 September would show a third of it as empty.
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

/** The window a period covers, ending today. */
export function windowFor(period: Period, today = todayIso()): { from: string; to: string } {
  const { year, month } = parts(today);

  const from = (() => {
    switch (period) {
      case "day":
        return today;
      case "week":
        return startOfWeek(today);
      case "month":
        return iso(year, month, 1);
      case "quarter":
        return startOfQuarter(today);
      case "half":
        // The second half starts in July; the first in January.
        return iso(year, month <= 6 ? 1 : 7, 1);
      case "threeQuarters": {
        // This quarter and the two before it, still landing on a quarter
        // boundary — so in Q3 it starts on 1 January, not on some date nine
        // months back.
        const { year: qy, month: qm } = parts(startOfQuarter(today));
        const back = qm - 6;
        return back > 0 ? iso(qy, back, 1) : iso(qy - 1, back + 12, 1);
      }
      case "year":
        return iso(year, 1, 1);
    }
  })();

  return { from, to: today };
}
