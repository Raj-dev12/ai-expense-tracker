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
    // Empty when the parser could not read a date it was clearly given. An
    // empty box is the point: it cannot be scanned past the way a plausible
    // wrong date can.
    expenseDate: suggestion.expenseDate ?? "",
    note: suggestion.description ?? "",
  });

  const amountUsable = amountIsUsable(values.amount);
  /**
   * A date has to be present before this can be saved.
   *
   * The same rule the amount has followed since the beginning, applied to the
   * date for the same reason. It only ever bites when the parser handed back
   * nothing: a sentence with no date in it gets today, which is a real value and
   * passes this immediately.
   */
  const dateUsable = values.expenseDate !== "";
  const usable = amountUsable && dateUsable;

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
        // The cursor goes to the date only when the amount does not need it
        // first. Two fields cannot both be focused, and the amount is the one
        // without which nothing can be saved at all.
        autoFocusDate={suggestion.amount !== null && suggestion.expenseDate === null}
        flagDate={suggestion.expenseDate === null && values.expenseDate === ""}
        showCurrency={showCurrency}
        categories={categories}
      />

      {/*
        The date problem is stated separately from the amount one, and in
        stronger terms, because it is a different kind of failure.

        A missing amount is the parser finding nothing. A missing date is the
        parser finding something and not understanding it, which means the
        sentence contains a date this screen is not showing — so the note quotes
        the text that failed rather than saying something general. Falling back to
        today here would have put a plausible wrong date in the box, and a wrong
        date that looks deliberate is exactly what a person scanning a screen full
        of sensible values does not catch.
      */}
      {suggestion.dateNote && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {suggestion.dateNote} Pick the right one before saving.
        </p>
      )}

      {!amountUsable && (
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
