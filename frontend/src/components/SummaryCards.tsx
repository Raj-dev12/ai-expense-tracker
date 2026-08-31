import type { Summary } from "../api";
import { formatMoney, formatMonth } from "../format";

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

export function SummaryCards({
  summary,
  currency,
}: {
  summary: Summary;
  currency: string;
}) {
  const month = formatMonth(summary.from);

  /**
   * The comparison is deliberately not coloured green or red.
   *
   * Spending more than last month is not automatically bad — it might be a
   * holiday, or rent falling in a different week — and painting it red would be
   * the interface drawing a conclusion the data does not support. An arrow and a
   * plain sentence say what happened and leave the judgement to the reader.
   */
  const change = summary.changePercent;
  const comparison =
    change === null
      ? "Nothing recorded for the same days last month"
      : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change)}% against the same ${summary.daysElapsed} days last month`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        label={`Spent in ${month}`}
        value={formatMoney(summary.totalBase, currency)}
        note={`${summary.daysElapsed} days so far`}
      />
      <Card
        label="Expenses"
        value={String(summary.count)}
        note={summary.count === 1 ? "one entry" : "entries this month"}
      />
      <Card
        label="Daily average"
        value={formatMoney(summary.dailyAverageBase, currency)}
        note="across the month so far"
      />
      <Card
        label="Against last month"
        value={change === null ? "—" : `${change >= 0 ? "+" : ""}${change}%`}
        note={comparison}
      />
    </div>
  );
}
