import { useState } from "react";
import type { Expense, ExpensePatch } from "../api";
import { formatDayMonth, formatMoney } from "../format";
import { ExpenseEditor } from "./ExpenseEditor";

/**
 * Every expense, newest first, in a box of its own.
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
  showCurrency,
  editingId,
  savingEdit,
  editError,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  categories,
  onDelete,
}: {
  expenses: Expense[];
  total: number;
  currency: string;
  showCurrency: boolean;
  editingId: string | null;
  savingEdit: boolean;
  editError: string | null;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, patch: ExpensePatch) => void;
  categories: string[];
  onDelete: (id: string) => void;
}) {
  // Which row is asking "are you sure?". Kept here rather than in the page
  // because it is a question about one row and dies with it.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-medium text-slate-900">Expenses</h2>
        <span className="text-xs text-slate-400">
          {expenses.length === total
            ? `${total} ${total === 1 ? "expense" : "expenses"}`
            : `showing ${expenses.length} of ${total}`}
        </span>
      </header>

      {expenses.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Nothing saved yet.</p>
      ) : (
        /**
         * A fixed height with its own scrollbar, rather than a page that grows
         * with the data.
         *
         * The whole list arrives in one request — a hundred rows is nothing to
         * fetch and nothing to render, and paging it would add a loading state,
         * a scroll listener and an off-by-one to save an amount of work that is
         * already free. What it does need is a floor: an unbounded list pushes
         * the charts and the categories panel off the bottom of the page, so the
         * box keeps its size and the rows move inside it.
         */
        <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto pr-1">
          {expenses.map((expense) =>
            expense.id === editingId ? (
              <li key={expense.id} className="py-3">
                <ExpenseEditor
                  expense={expense}
                  saving={savingEdit}
                  error={editError}
                  showCurrency={showCurrency}
                  categories={categories}
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
              <li key={expense.id} className="py-3">
                <div className="group flex items-baseline gap-4">
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

                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(expense.id)}
                    className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Delete
                  </button>

                  <div className="text-right">
                    <p className="text-sm tabular-nums text-slate-900">
                      {formatMoney(expense.amountBase, currency)}
                    </p>
                    {/* The original currency, quietly, and only when there is more
                        than one currency in play and this row is in another one. */}
                    {showCurrency && expense.currency !== currency && (
                      <p className="text-xs tabular-nums text-slate-400">
                        {expense.amount} {expense.currency}
                      </p>
                    )}
                  </div>
                </div>

                {/* The confirmation repeats the row back rather than saying "are
                    you sure?". A row is one line among ten and the wrong Delete
                    is one pixel away from the right one, so the question has to
                    name the thing it is about. */}
                {confirmingDelete === expense.id && (
                  <div className="mt-2 space-y-3 rounded-xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-700">
                      Delete{" "}
                      <strong>{expense.merchant ?? expense.description ?? "this expense"}</strong>,{" "}
                      {formatMoney(expense.amountBase, currency)} on{" "}
                      {formatDayMonth(expense.expenseDate)}, filed under {expense.category}?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(expense.id);
                          setConfirmingDelete(null);
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                      >
                        Delete it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(null)}
                        className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:text-slate-800"
                      >
                        Cancel
                      </button>
                      <span className="text-xs text-slate-400">This cannot be undone.</span>
                    </div>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
