import type { BaseCurrencyChange } from "../api";

/**
 * A short list rather than all twelve supported currencies.
 *
 * The dropdown next to a heading is a glance-and-move-on control, and twelve
 * options is a menu you have to read. These are the ones a demo is plausibly
 * reported in; an expense can still be *entered* in any of the twelve, which is
 * a different question and keeps its full list.
 */
export const COMMON_BASE_CURRENCIES = ["EUR", "GBP", "USD", "SEK", "CHF"] as const;

/**
 * Choose the currency every total on the page is reported in.
 *
 * The note underneath is not decoration. Switching the base does two different
 * things to two kinds of row, and one of them is surprising enough that leaving
 * it unsaid would look like a bug:
 *
 * - an expense recorded in the old base keeps its number and is simply read as
 *   the new currency — 42 stays 42
 * - an expense recorded in some other currency is converted again, at the rate
 *   for the day it was spent
 *
 * So this relabels rather than migrates, and says so.
 */
export function BaseCurrencyPicker({
  value,
  saving,
  lastChange,
  onChange,
}: {
  value: string;
  saving: boolean;
  lastChange: BaseCurrencyChange | null;
  onChange: (currency: string) => void;
}) {
  return (
    <div className="text-right">
      <label className="flex items-center justify-end gap-2">
        <span className="text-xs font-medium text-slate-500">Totals in</span>
        <select
          value={value}
          disabled={saving}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-accent disabled:opacity-50"
        >
          {COMMON_BASE_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-1 max-w-xs text-xs text-slate-400">
        {saving
          ? "Reworking your totals..."
          : lastChange
            ? `${lastChange.relabelled} ${lastChange.relabelled === 1 ? "expense kept its" : "expenses kept their"} number and now read as ${lastChange.baseCurrency}. ${lastChange.recomputed} in another currency ${lastChange.recomputed === 1 ? "was" : "were"} converted again.`
            : "Relabels amounts already in this currency; converts the rest."}
      </p>
    </div>
  );
}
