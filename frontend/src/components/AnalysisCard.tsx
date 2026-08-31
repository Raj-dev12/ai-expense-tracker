import { useState } from "react";
import type { AskAnswer, MonthlySummary as Summary } from "../api";
import { PERIODS, PERIOD_LABELS, type Period } from "../periods";

/**
 * Two ways of asking the AI about the selected period, in one card.
 *
 * The top half describes the period; the bottom half answers a question about
 * it. They share a card because they share a period — the dropdown governs both,
 * so the sentence and the answer are never about different stretches of time.
 *
 * This was `MonthlySummary` until the question box arrived. A component called
 * MonthlySummary containing a query box would be the kind of small lie this
 * repository keeps not telling.
 */

/**
 * Say plainly which parser answered.
 *
 * Not decoration. The configured provider and the one that answered are
 * different things whenever a real provider fails and the mock catches it, and
 * the person reading should be able to tell which of the two they are looking
 * at. The mock gets an extra clause because "mock" on its own does not explain
 * itself to somebody who has just cloned the repository.
 */
function credit(provider: string): string {
  return provider === "mock"
    ? "Written by the mock parser — offline, no API key needed"
    : `Written by the ${provider} parser`;
}

export function AnalysisCard({
  period,
  onPeriodChange,
  summary,
  writtenAt,
  loading,
  error,
  onRequest,
  answer,
  asking,
  askError,
  onAsk,
}: {
  /**
   * Which window the whole section describes.
   *
   * It governs the cards and the pie as well as this card, so that the numbers,
   * the slices, the sentence and the answer on screen are always about the same
   * stretch of time.
   */
  period: Period;
  onPeriodChange: (period: Period) => void;
  summary: Summary | null;
  /**
   * When the summary came back.
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
  answer: AskAnswer | null;
  asking: boolean;
  askError: string | null;
  onAsk: (question: string) => void;
}) {
  const [question, setQuestion] = useState("");

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
      {loading && summary && <p className="text-sm text-slate-400">Writing it again...</p>}

      {summary && !loading && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-slate-700">{summary.summary}</p>
          <p className="text-xs text-slate-400">
            {credit(summary.provider)}
            {writtenAt && ` · ${writtenAt.toLocaleTimeString()}`}
          </p>
        </div>
      )}

      {/*
        The question box.

        No button of its own, and no accent colour: Summarise is the card's one
        coloured control, and a second one beside it would be two things
        competing for the same glance. Enter submits, which is what a single
        field in a form does anyway.

        The placeholder deliberately reads as a question rather than a statement,
        because the add box at the top of the page also takes a sentence and the
        likeliest mistake with this feature is typing an expense in here. When
        that happens the answer is a signpost rather than a refusal.
      */}
      <form
        className="mt-5 border-t border-slate-100 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!question.trim() || asking) return;
          onAsk(question.trim());
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about your spending — highest expense in Travel"
          maxLength={300}
          className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-accent"
        />

        {askError && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{askError}</p>
        )}

        {asking && <p className="mt-3 text-sm text-slate-400">Looking...</p>}

        {answer && !asking && !askError && (
          <div className="mt-3 space-y-1">
            <p
              className={[
                "text-sm leading-relaxed",
                answer.answerable ? "text-slate-700" : "text-slate-500",
              ].join(" ")}
            >
              {answer.answer}
            </p>

            {/* The signpost. Two text boxes on one page that both take a
                sentence is the design's one real hazard, so the likeliest
                mistake gets a sentence pointing at the right one. */}
            {answer.looksLikeExpense && (
              <p className="text-sm text-slate-500">
                Add it with the box at the top of the page, where it can be checked before it is
                saved.
              </p>
            )}

            {answer.reading && <p className="text-xs text-slate-400">read as: {answer.reading}</p>}
          </div>
        )}
      </form>
    </section>
  );
}
