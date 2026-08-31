import type { Expense } from "../api";
import { formatFullDay, formatMoney } from "../format";

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
 */
export function DayView({
  date,
  expenses,
  currency,
  loading,
  onDateChange,
}: {
  date: string;
  expenses: Expense[];
  currency: string;
  loading: boolean;
  onDateChange: (date: string) => void;
}) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amountBase), 0);

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-slate-900">{formatFullDay(date)}</h2>
          <p className="text-xs text-slate-400">
            {loading
              ? "Loading..."
              : expenses.length === 0
                ? "Nothing recorded"
                : `${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}`}
          </p>
        </div>

        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Day</span>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              // An emptied date input reports "", which would ask the API for
              // every expense ever. Ignoring it leaves the day where it was.
              if (event.target.value) onDateChange(event.target.value);
            }}
            className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-accent"
          />
        </label>
      </header>

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
    </section>
  );
}
