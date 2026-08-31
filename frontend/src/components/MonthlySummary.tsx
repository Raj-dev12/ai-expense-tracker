import type { MonthlySummary as Summary } from "../api";
import { PERIODS, PERIOD_LABELS, type Period } from "../periods";

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
  period,
  onPeriodChange,
  summary,
  writtenAt,
  loading,
  error,
  onRequest,
}: {
  /**
   * Which window the whole section describes.
   *
   * It governs the cards and the pie as well as this sentence, so that the
   * numbers, the slices and the prose on screen are always about the same
   * stretch of time. A dropdown that changed only the sentence would be an
   * invitation to compare two different periods by eye.
   */
  period: Period;
  onPeriodChange: (period: Period) => void;
  summary: Summary | null;
  /**
   * When this summary came back.
   *
   * Here because the parser is deterministic: asked twice about unchanged
   * figures it returns the identical sentence, so a re-run leaves the card
   * looking exactly as it did. Without a clock somewhere on it, pressing the
   * button again is indistinguishable from the button being broken — which is
   * precisely how it was reported.
   */
  writtenAt: Date | null;
  loading: boolean;
  error: string | null;
  onRequest: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as Period)}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-accent"
          >
            {PERIODS.map((name) => (
              <option key={name} value={name}>
                {PERIOD_LABELS[name]}
              </option>
            ))}
          </select>
          <h2 className="text-base font-medium text-slate-900">in words</h2>
        </div>
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
          Ask the parser to describe this spending in a sentence or two.
        </p>
      )}

      {/* Replaces the sentence rather than sitting beside it, so a re-run is a
          visible change even when the words that come back are identical. */}
      {loading && summary && (
        <p className="text-sm text-slate-400">Writing it again...</p>
      )}

      {summary && !loading && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-slate-700">{summary.summary}</p>
          <p className="text-xs text-slate-400">
            {credit(summary.provider)}
            {writtenAt && ` · ${writtenAt.toLocaleTimeString()}`}
          </p>
        </div>
      )}
    </section>
  );
}
