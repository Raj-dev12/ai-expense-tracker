import { useState } from "react";

/**
 * A searchable list of every ISO 4217 currency.
 *
 * A native `<select>` with 162 options is technically a list and practically a
 * wall. Typing narrows it, which is how anyone actually finds "SEK" in a list
 * that long. The names come from `Intl.DisplayNames`, built into the browser, so
 * a person can search "pound" as readily as "GBP".
 */
const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

export function currencyLabel(code: string): string {
  try {
    const name = currencyNames.of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}

/** A few worth putting within one click, before anyone starts typing. */
const QUICK_PICKS = ["EUR", "GBP", "USD", "SEK", "CHF"];

/**
 * The first thing a new visitor sees.
 *
 * It comes before the dashboard rather than beside it, because the demo data is
 * plain numbers and what those numbers *are* is not a detail to discover later —
 * a page showing "1,864.41" with no symbol has told you almost nothing. Picking
 * is the whole interaction: there is no skip, because every screen behind this
 * one needs an answer.
 */
export function CurrencyChoice({
  currencies,
  saving,
  error,
  onChoose,
}: {
  currencies: string[];
  saving: boolean;
  error: string | null;
  onChoose: (currency: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("EUR");

  const needle = filter.trim().toLowerCase();
  const matches = needle
    ? currencies.filter((code) => currencyLabel(code).toLowerCase().includes(needle)).slice(0, 40)
    : currencies;

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-2xl bg-white p-8 ring-1 ring-slate-200">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Which currency do you use?</h1>
        <p className="text-slate-500">
          Every total is shown in this currency. The demo expenses are plain numbers, so they
          will read as whatever you pick. You can change it later.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_PICKS.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setSelected(code)}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              selected === code
                ? "bg-accent text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {code}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Or search all 162 — try 'pound' or 'SEK'"
          className="w-full rounded-xl bg-white px-4 py-3 text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-accent"
        />

        <select
          size={6}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="w-full rounded-xl bg-white px-2 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-accent"
        >
          {matches.map((code) => (
            <option key={code} value={code}>
              {currencyLabel(code)}
            </option>
          ))}
        </select>

        {needle && matches.length === 0 && (
          <p className="text-sm text-slate-400">Nothing matches “{filter}”.</p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={() => onChoose(selected)}
        className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? "Setting up..." : `Use ${selected}`}
      </button>
    </div>
  );
}
