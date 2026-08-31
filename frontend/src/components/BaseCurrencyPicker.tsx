import { currencyLabel } from "./CurrencyChoice";

/**
 * Change the currency every total is reported in, after the first visit.
 *
 * The note underneath is short now because the behaviour became simple: this
 * changes the symbol and nothing else. No stored figure moves, so switching to
 * another currency and back leaves the database exactly as it was.
 *
 * It said something much longer when switching used to recompute foreign rows
 * and relabel the rest. That version worked, but a round trip lost information,
 * and an interface needing a paragraph to explain what a dropdown does is a
 * fair sign the dropdown is doing too much.
 */
export function BaseCurrencyPicker({
  value,
  currencies,
  saving,
  onChange,
}: {
  value: string;
  currencies: string[];
  saving: boolean;
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
          className="max-w-[10rem] rounded-lg bg-white px-3 py-1.5 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-accent disabled:opacity-50"
        >
          {currencies.map((code) => (
            <option key={code} value={code} title={currencyLabel(code)}>
              {code}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-1 text-xs text-slate-400">
        {saving ? "Saving..." : "Changes the symbol only. No amount is altered."}
      </p>
    </div>
  );
}
