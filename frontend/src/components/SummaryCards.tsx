import type { Summary } from "../api";
import { formatDayMonth, formatMoney } from "../format";

/**
 * Four numbers, shown as numbers.
 *
 * There is no chart here on purpose: a single figure is best drawn as itself.
 * The values use proportional digits rather than the tabular ones used in the
 * list below, because equal-width digits make a large standalone number look
 * loosely spaced.
 */
function Card({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-slate-200">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

/**
 * Nothing here says "month" any more.
 *
 * Every label in this card used to: "Spent in August", "entries this month",
 * "across the month so far", "against the same 31 days last month". All of that
 * was true when a month was the only period there was, and every one of them
 * became a false statement the moment the period dropdown arrived — a quarter
 * was reported as "31 days last month" while the figure underneath compared it
 * against 30 April to 30 June.
 *
 * The comparison note now names the window it actually compared against, taken
 * from the response rather than described in prose. A reader can check it
 * against the calendar; there is nothing left to misread.
 */
export function SummaryCards({
  summary,
  currency,
  phrase,
}: {
  summary: Summary;
  currency: string;
  /**
   * The window as it reads after "Spent": "this month", "in August 2026", "on
   * 1 Sep 2026", "from 1 Jun to 15 Jul 2026".
   *
   * A phrase rather than a period name, because the cards now describe blocks
   * that are not "this" anything. Built in periods.ts so the grammar lives with
   * the calendar logic rather than being reassembled here.
   */
  phrase: string;
}) {
  const noun = phrase;
  const days = `${summary.daysElapsed} ${summary.daysElapsed === 1 ? "day" : "days"}`;
  const before = `${formatDayMonth(summary.previous.from)} – ${formatDayMonth(summary.previous.to)}`;

  /**
   * The comparison is deliberately not coloured green or red.
   *
   * Spending more than the stretch before is not automatically bad — it might be
   * a holiday, or rent falling in a different week — and painting it red would be
   * the interface drawing a conclusion the data does not support. An arrow and a
   * plain sentence say what happened and leave the judgement to the reader.
   */
  /**
   * Three outcomes, not two.
   *
   * A percentage needs a baseline worth measuring against. On the 1st of a
   * month this period is one day and the stretch before it is one day, and a
   * quiet day before a normal one produced "2586% more" — correct arithmetic
   * describing nothing but whether a single purchase happened to land inside
   * the window. The backend decides whether the baseline is usable and says why
   * it is not; this only has to report which of the two silences it is, because
   * "nothing was recorded then" and "too little was" are different facts and a
   * bare dash says neither.
   */
  const change = summary.changePercent;
  const comparison =
    change !== null
      ? `${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}% against ${before}`
      : summary.baseline === "empty"
        ? `Nothing recorded in ${before}`
        : summary.baseline === "not-comparable"
          ? "No comparison for a custom range"
          : `Too little in ${before} to compare`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label={`Spent ${noun}`}
        value={formatMoney(summary.totalBase, currency)}
        note={`${days} so far`}
      />
      <Card
        label="Expenses"
        value={String(summary.count)}
        note={summary.count === 1 ? "one entry" : `entries ${noun}`}
      />
      <Card
        label="Daily average"
        value={formatMoney(summary.dailyAverageBase, currency)}
        note={`across ${days}`}
      />
      <Card
        label="Change"
        value={change === null ? "—" : `${change >= 0 ? "+" : ""}${change}%`}
        note={comparison}
      />
    </div>
  );
}
