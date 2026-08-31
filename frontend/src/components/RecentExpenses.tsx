import type { Expense } from "../api";

const euros = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/**
 * A short list of what is actually in the database.
 *
 * This is a placeholder for the full recent-expenses section that comes with the
 * rest of the page. It exists now so that pressing save has a visible
 * consequence — otherwise there is no way to see that the confirm step really
 * wrote anything.
 */
export function RecentExpenses({ expenses, total }: { expenses: Expense[]; total: number }) {
  if (expenses.length === 0) {
    return <p className="text-sm text-slate-400">Nothing saved yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-slate-900">Recently added</h2>
        <span className="text-xs text-slate-400">{total} in total</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {expenses.map((expense) => (
          <li key={expense.id} className="flex items-baseline gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-900">
                {expense.merchant ?? expense.description ?? "Unnamed expense"}
              </p>
              <p className="text-xs text-slate-400">
                {expense.category} · {expense.expenseDate}
                {expense.source !== "web" && ` · via ${expense.source}`}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm tabular-nums text-slate-900">
                {euros.format(Number(expense.amountEur))}
              </p>
              {/* The original currency, shown quietly, only when it was not euros. */}
              {expense.currency !== "EUR" && (
                <p className="text-xs tabular-nums text-slate-400">
                  {expense.amount} {expense.currency}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
