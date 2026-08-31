import { useState } from "react";
import {
  CATEGORY_NAMES,
  CURRENCIES,
  type CategoryName,
  type NewExpense,
  type Suggestion,
} from "../api";
import { Chip, fieldClass } from "./Chip";

/**
 * The confirm step — the whole reason this project exists.
 *
 * Nothing has been saved at this point. The parser has made some guesses, they
 * are all editable, and only pressing save sends anything to the validated
 * endpoint that writes to the database.
 */
export function SuggestionReview({
  suggestion,
  confidence,
  provider,
  saving,
  onSave,
  onCancel,
}: {
  suggestion: Suggestion;
  confidence: number;
  provider: string;
  saving: boolean;
  onSave: (expense: NewExpense) => void;
  onCancel: () => void;
}) {
  // Held as text while being edited, because a half-typed number is not a
  // number. It is converted once, on save.
  const [amount, setAmount] = useState(suggestion.amount?.toString() ?? "");
  const [currency, setCurrency] = useState(suggestion.currency);
  const [merchant, setMerchant] = useState(suggestion.merchant ?? "");
  const [category, setCategory] = useState<CategoryName>(suggestion.category);
  const [expenseDate, setExpenseDate] = useState(suggestion.expenseDate);
  const [note, setNote] = useState(suggestion.description ?? "");

  const parsedAmount = Number(amount.replace(",", "."));
  const amountIsUsable = amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!amountIsUsable || saving) return;

    onSave({
      amount: parsedAmount,
      currency,
      merchant: merchant.trim() || null,
      category,
      description: note.trim() || null,
      expenseDate,
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Chip label="Amount">
          <input
            className={fieldClass}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoFocus={suggestion.amount === null}
          />
        </Chip>

        <Chip label="Currency">
          <select
            className={fieldClass}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Chip>

        <Chip label="Merchant">
          <input
            className={fieldClass}
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Not recognised"
          />
        </Chip>

        <Chip label="Category">
          <select
            className={fieldClass}
            value={category}
            onChange={(event) => setCategory(event.target.value as CategoryName)}
          >
            {CATEGORY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Chip>

        <Chip label="Date">
          <input
            type="date"
            className={fieldClass}
            value={expenseDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setExpenseDate(event.target.value)}
          />
        </Chip>

        <Chip label="Note" wide>
          <input
            className={fieldClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
          />
        </Chip>
      </div>

      {!amountIsUsable && (
        <p className="text-sm text-slate-500">
          {suggestion.amount === null
            ? "No amount was found in that sentence. Add one to save it."
            : "Enter an amount greater than zero."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!amountIsUsable || saving}
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
