import type { Expense } from "../api";
import { formatFullDay, formatMoney } from "../format";
import { CollapsiblePanel } from "./Panel";

/**
 * One day at a time, as a table.
 *
 * A table rather than the stacked rows the main list uses, because a single day
 * is short enough to line up: with ten rows the amounts and categories form
 * columns you can read down, which is the thing a day view is for. The main list
 * holds a hundred and would be a wall.
 *
 * It reads the same `GET /api/expenses` everything else does, with `from` and
 * `to` pointed at the same date. A single day is a range whose ends match, so it
 * needs no endpoint of its own — and a second way to ask the same question is a
 * second place for the answer to drift.
 *
 * It has no date picker of its own. The calendar above it chooses the day, and
 * two controls setting the same value would have to be kept in step for no gain
 * — the calendar can already do everything the picker could, and shows what each
 * day holds before you pick it. This component now only displays.
 */
export function DayView({
  date,
  expenses,
  currency,
  loading,
  open,
  onToggle,
}: {
  date: string;
  expenses: Expense[];
  currency: string;
  loading: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amountBase), 0);

  const count = loading
    ? "Loading..."
    : expenses.length === 0
      ? "Nothing recorded"
      : `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}`;

  return (
    <CollapsiblePanel
      id="day"
      title={formatFullDay(date)}
      note={count}
      // Closed, it still carries the day's total, which is the one number
      // somebody folding this panel away is most likely to want back.
      summary={expenses.length === 0 ? count : `${count} · ${formatMoney(total, currency)}`}
      open={open}
      onToggle={onToggle}
    >
      {expenses.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {loading ? "..." : "Nothing spent on this day."}
        </p>
      ) : (
        // Wrapped so a narrow screen scrolls the table rather than the page.
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="pb-2 font-medium text-slate-500">What</th>
                <th className="pb-2 font-medium text-slate-500">Category</th>
                <th className="pb-2 text-right font-medium text-slate-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="py-2 pr-4 text-slate-900">
                    {expense.merchant ?? expense.description ?? "Unnamed expense"}
                    {expense.source !== "web" && (
                      <span className="ml-2 text-xs text-slate-400">
                        added by {expense.source}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{expense.category}</td>
                  <td className="py-2 text-right tabular-nums text-slate-900">
                    {formatMoney(expense.amountBase, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* A column of amounts with no sum at the bottom is a table asking
                  to be added up by hand. */}
              <tr className="border-t border-slate-200">
                <td className="pt-2 text-xs font-medium text-slate-500" colSpan={2}>
                  Total
                </td>
                <td className="pt-2 text-right font-medium tabular-nums text-slate-900">
                  {formatMoney(total, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </CollapsiblePanel>
  );
}
