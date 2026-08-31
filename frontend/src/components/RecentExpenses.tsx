import type { Expense, ExpensePatch } from "../api";
import { formatDayMonth, formatMoney } from "../format";
import { ExpenseEditor } from "./ExpenseEditor";

/**
 * The most recent expenses, newest first.
 *
 * `source` is shown when a row did not come from this page, because being able
 * to point at a row and say an outside assistant wrote that one is the whole
 * reason the column exists.
 *
 * A row can be edited in place: pressing edit replaces that one row with the
 * same chips the confirm step uses. Only one row is open at a time, which is why
 * the open row is passed in as an id rather than tracked here — the page owns
 * that decision, and it keeps two half-finished edits from existing at once.
 */
export function RecentExpenses({
  expenses,
  total,
  currency,
  editingId,
  savingEdit,
  editError,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  expenses: Expense[];
  total: number;
  currency: string;
  editingId: string | null;
  savingEdit: boolean;
  editError: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, patch: ExpensePatch) => void;
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
          {expenses.map((expense) =>
            expense.id === editingId ? (
              <li key={expense.id} className="py-3">
                <ExpenseEditor
                  expense={expense}
                  saving={savingEdit}
                  error={editError}
                  onSave={onSaveEdit}
                  onCancel={onCancelEdit}
                />
              </li>
            ) : (
              // `group` lets the edit button stay invisible until the row is
              // hovered or the button itself is focused by keyboard. It is a
              // secondary action on every row of a list; showing ten of them at
              // rest would compete with the amounts, which are what the list is
              // actually for.
              <li key={expense.id} className="group flex items-baseline gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900">
                    {expense.merchant ?? expense.description ?? "Unnamed expense"}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {expense.category} · {formatDayMonth(expense.expenseDate)}
                    {expense.source !== "web" && ` · added by ${expense.source}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onEdit(expense.id)}
                  className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-accent focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Edit
                </button>

                <div className="text-right">
                  <p className="text-sm tabular-nums text-slate-900">
                    {formatMoney(expense.amountBase, currency)}
                  </p>
                  {/* The original currency, quietly, and only when it differs from
                      the base everything is reported in. */}
                  {expense.currency !== currency && (
                    <p className="text-xs tabular-nums text-slate-400">
                      {expense.amount} {expense.currency}
                    </p>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
