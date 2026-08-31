import { CATEGORY_NAMES, CURRENCIES, type CategoryName } from "../api";
import { Chip, fieldClass } from "./Chip";

/**
 * The six editable fields of an expense, as chips.
 *
 * This grid was written for the confirm step, where it shows the parser's
 * guesses before anything is saved. Editing an existing row needs the same six
 * fields with the same rules, so it lives here and both screens render it rather
 * than each keeping its own copy. Two copies would mean adding a currency to one
 * list and not the other, or a date limit that applies when creating but not
 * when correcting.
 *
 * It holds no state of its own. Whoever renders it owns the values, because the
 * confirm step and the editor do different things with them.
 */

export type ExpenseFieldValues = {
  /**
   * Kept as text rather than a number while being edited: a half-typed "12." is
   * not a number, and neither is an empty box. It is converted once, on save.
   */
  amount: string;
  currency: string;
  merchant: string;
  category: CategoryName;
  expenseDate: string;
  note: string;
};

/** Accepts a comma as the decimal separator, which is what a Finnish keyboard gives. */
export function parseAmount(text: string): number {
  return Number(text.replace(",", "."));
}

export function amountIsUsable(text: string): boolean {
  const value = parseAmount(text);
  return text.trim() !== "" && Number.isFinite(value) && value > 0;
}

export function ExpenseFields({
  values,
  onChange,
  autoFocusAmount = false,
  showCurrency = true,
}: {
  values: ExpenseFieldValues;
  onChange: (patch: Partial<ExpenseFieldValues>) => void;
  autoFocusAmount?: boolean;
  /**
   * Hidden when conversion is off, because then there is exactly one currency
   * and it is the base. A dropdown offering a choice that will be ignored is
   * worse than no dropdown: it invites somebody to set it and wonder why
   * nothing happened.
   */
  showCurrency?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Chip label="Amount">
        <input
          className={fieldClass}
          value={values.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
          placeholder="0.00"
          inputMode="decimal"
          autoFocus={autoFocusAmount}
        />
      </Chip>

      {showCurrency && (
        <Chip label="Currency">
          <select
            className={fieldClass}
            value={values.currency}
            onChange={(event) => onChange({ currency: event.target.value })}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Chip>
      )}

      <Chip label="Merchant">
        <input
          className={fieldClass}
          value={values.merchant}
          onChange={(event) => onChange({ merchant: event.target.value })}
          placeholder="Not recognised"
        />
      </Chip>

      <Chip label="Category">
        <select
          className={fieldClass}
          value={values.category}
          onChange={(event) => onChange({ category: event.target.value as CategoryName })}
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
          value={values.expenseDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => onChange({ expenseDate: event.target.value })}
        />
      </Chip>

      <Chip label="Note" wide>
        <input
          className={fieldClass}
          value={values.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="Optional"
        />
      </Chip>
    </div>
  );
}
