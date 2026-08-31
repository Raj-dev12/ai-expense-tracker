import { useState } from "react";
import { type NewExpense, type Suggestion } from "../api";
import {
  ExpenseFields,
  amountIsUsable,
  parseAmount,
  type ExpenseFieldValues,
} from "./ExpenseFields";

/**
 * The confirm step — the whole reason this project exists.
 *
 * Nothing has been saved at this point. The parser has made some guesses, they
 * are all editable, and only pressing save sends anything to the validated
 * endpoint that writes to the database.
 *
 * The fields themselves live in ExpenseFields, shared with the editor on the
 * recent list. What is particular to this screen is the framing: that these are
 * guesses, that nothing is stored yet, and that an amount the parser could not
 * find has to be filled in before saving is possible.
 */
export function SuggestionReview({
  suggestion,
  confidence,
  provider,
  saving,
  showCurrency,
  categories,
  onSave,
  onCancel,
}: {
  suggestion: Suggestion;
  confidence: number;
  provider: string;
  saving: boolean;
  showCurrency: boolean;
  categories: string[];
  onSave: (expense: NewExpense) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ExpenseFieldValues>({
    amount: suggestion.amount?.toString() ?? "",
    currency: suggestion.currency,
    merchant: suggestion.merchant ?? "",
    category: suggestion.category,
    expenseDate: suggestion.expenseDate,
    note: suggestion.description ?? "",
  });

  const usable = amountIsUsable(values.amount);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!usable || saving) return;

    onSave({
      amount: parseAmount(values.amount),
      currency: values.currency,
      merchant: values.merchant.trim() || null,
      category: values.category,
      description: values.note.trim() || null,
      expenseDate: values.expenseDate,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-slate-900">Check this before saving</h2>
        <p className="text-sm text-slate-500">
          Nothing has been saved yet. Correct anything that is wrong.
        </p>
      </div>

      <ExpenseFields
        values={values}
        onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        autoFocusAmount={suggestion.amount === null}
        showCurrency={showCurrency}
        categories={categories}
      />

      {!usable && (
        <p className="text-sm text-slate-500">
          {suggestion.amount === null
            ? "No amount was found in that sentence. Add one to save it."
            : "Enter an amount greater than zero."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!usable || saving}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save expense"}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2.5 text-sm text-slate-500 transition hover:text-slate-800"
        >
          Discard
        </button>

        {/* Muted, and nothing depends on it. The person reading is the real
            threshold, not a number. */}
        <span className="ml-auto text-xs text-slate-400">
          {provider} parser, {Math.round(confidence * 100)}% confident
        </span>
      </div>
    </form>
  );
}
