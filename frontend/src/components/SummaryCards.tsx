import type { Summary } from "../api";
import { formatDayMonth, formatMoney } from "../format";
import { PERIOD_NOUNS, type Period } from "../periods";

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
  period,
}: {
  summary: Summary;
  currency: string;
  period: Period;
}) {
  const noun = PERIOD_NOUNS[period];
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
  const change = summary.changePercent;
  const comparison =
    change === null
      ? `Nothing recorded in ${before}`
      : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}% against ${before}`;

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
