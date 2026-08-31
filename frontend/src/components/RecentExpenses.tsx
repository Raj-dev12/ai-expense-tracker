import type { Expense } from "../api";
import { formatDayMonth, formatEur } from "../format";

/**
 * The most recent expenses, newest first.
 *
 * `source` is shown when a row did not come from this page, because being able
 * to point at a row and say an outside assistant wrote that one is the whole
 * reason the column exists.
 */
export function RecentExpenses({
  expenses,
  total,
}: {
  expenses: Expense[];
  total: number;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-medium text-slate-900">Recent expenses</h2>
        <span className="text-xs text-slate-400">
          showing {expenses.length} of {total}
        </span>
      </header>

      {expenses.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nothing saved yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-baseline gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-900">
                  {expense.merchant ?? expense.description ?? "Unnamed expense"}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {expense.category} · {formatDayMonth(expense.expenseDate)}
                  {expense.source !== "web" && ` · added by ${expense.source}`}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm tabular-nums text-slate-900">
                  {formatEur(expense.amountEur)}
                </p>
                {/* The original currency, quietly, and only when it was not euros. */}
                {expense.currency !== "EUR" && (
                  <p className="text-xs tabular-nums text-slate-400">
                    {expense.amount} {expense.currency}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
