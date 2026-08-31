import type { MonthlySummary as Summary } from "../api";
import { formatMonth } from "../format";

/**
 * Say plainly which parser wrote the sentence.
 *
 * Not decoration. The configured provider and the one that answered are
 * different things whenever a real provider fails and the mock catches it, and
 * the person reading a summary should be able to tell which of the two they are
 * looking at. The mock gets an extra clause because "mock" on its own does not
 * explain itself to somebody who has just cloned the repository.
 */
function credit(provider: string): string {
  return provider === "mock"
    ? "Written by the mock parser — offline, no API key needed"
    : `Written by the ${provider} parser`;
}

/**
 * A button that asks the AI to describe the month, and the sentence it returns.
 *
 * Behind a button rather than loaded with the page, because it is the one thing
 * here that can cost money and take a second or two. The dashboard stays
 * instant, and asking for prose is a decision rather than a side effect of
 * opening the page.
 */
export function MonthlySummary({
  month,
  summary,
  loading,
  error,
  onRequest,
}: {
  month: string;
  summary: Summary | null;
  loading: boolean;
  error: string | null;
  onRequest: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium text-slate-900">{formatMonth(month)} in words</h2>
        <button
          type="button"
          onClick={onRequest}
          disabled={loading}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Writing..." : summary ? "Write it again" : "Summarise this month"}
        </button>
      </header>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!summary && !error && (
        <p className="text-sm text-slate-400">
          Ask the parser to describe this month's spending in a sentence or two.
        </p>
      )}

      {summary && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-slate-700">{summary.summary}</p>
          <p className="text-xs text-slate-400">{credit(summary.provider)}</p>
        </div>
      )}
    </section>
  );
}
