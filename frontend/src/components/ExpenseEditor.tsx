import { useState } from "react";
import type { CategoryName, Expense, ExpensePatch } from "../api";
import {
  ExpenseFields,
  amountIsUsable,
  parseAmount,
  type ExpenseFieldValues,
} from "./ExpenseFields";

/**
 * Edit one expense that already exists, in place in the list.
 *
 * The same six chips as the confirm step, from the same component, so the two
 * screens cannot disagree about what a valid expense looks like.
 */

/**
 * Work out what actually changed.
 *
 * The endpoint is a PATCH, so it takes only the fields being altered. Sending
 * all six every time would work, but it would also mean every edit re-converts
 * the currency — a request to the exchange rate service, and a fresh euro figure
 * — because the backend cannot tell "the amount is the same" from "the amount
 * was sent again". Correcting a misspelled shop name should not touch the money.
 *
 * A field cleared to empty becomes `null`, which is how the API says "empty
 * this", as distinct from leaving the key out, which says "leave it alone".
 */
export function buildPatch(original: Expense, values: ExpenseFieldValues): ExpensePatch {
  const patch: ExpensePatch = {};

  const amount = parseAmount(values.amount);
  if (amount !== Number(original.amount)) patch.amount = amount;
  if (values.currency !== original.currency) patch.currency = values.currency;
  if (values.category !== original.category) patch.category = values.category;
  if (values.expenseDate !== original.expenseDate) patch.expenseDate = values.expenseDate;

  const merchant = values.merchant.trim() || null;
  if (merchant !== original.merchant) patch.merchant = merchant;

  const note = values.note.trim() || null;
  if (note !== original.description) patch.description = note;

  return patch;
}

export function ExpenseEditor({
  expense,
  saving,
  error,
  showCurrency,
  onSave,
  onCancel,
}: {
  expense: Expense;
  saving: boolean;
  error: string | null;
  showCurrency: boolean;
  onSave: (id: string, patch: ExpensePatch) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ExpenseFieldValues>({
    amount: expense.amount,
    currency: expense.currency,
    merchant: expense.merchant ?? "",
    category: expense.category as CategoryName,
    expenseDate: expense.expenseDate,
    note: expense.description ?? "",
  });

  const patch = buildPatch(expense, values);
  const changedCount = Object.keys(patch).length;
  const usable = amountIsUsable(values.amount);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!usable || saving || changedCount === 0) return;
    onSave(expense.id, patch);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-slate-50 p-4">
      <ExpenseFields
        values={values}
        onChange={(next) => setValues((current) => ({ ...current, ...next }))}
        showCurrency={showCurrency}
      />

      {!usable && <p className="text-sm text-slate-500">Enter an amount greater than zero.</p>}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!usable || saving || changedCount === 0}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2.5 text-sm text-slate-500 transition hover:text-slate-800"
        >
          Cancel
        </button>

        {/* Says what will be sent. With a PATCH that is genuinely useful: it
            makes visible that an untouched field is not being rewritten. */}
        <span className="ml-auto text-xs text-slate-400">
          {changedCount === 0
            ? "Nothing changed yet"
            : `${changedCount} ${changedCount === 1 ? "field" : "fields"} will change`}
        </span>
      </div>
    </form>
  );
}
