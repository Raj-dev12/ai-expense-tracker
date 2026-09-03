import type { Baseline } from "../lib/baseline.js";
import type { CategoryName } from "../lib/categories.js";

export const AI_PROVIDER_NAMES = ["mock", "claude", "openai"] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

/**
 * What a parser made of a sentence. Every field is a *suggestion* — nothing here
 * has been saved, and nothing here is trusted until a person has confirmed it.
 *
 * `amount` is nullable on purpose. A parser that cannot find a number should say
 * so rather than invent one, and the confirm step is where a human fills it in.
 */
export type ExpenseSuggestion = {
  amount: number | null;
  currency: string;
  merchant: string | null;
  /**
   * A plain string, not the CategoryName union. The parsers guess from a fixed
   * vocabulary, but the categories that exist are rows in a table now, so the
   * type cannot claim to know them at compile time. The route checks the guess
   * against the live list before returning it.
   */
  category: string;
  description: string | null;
  expenseDate: string;
};

export type ParseResult = {
  suggestion: ExpenseSuggestion;
  /** 0 to 1. Never 1 — the whole design assumes the parser can be wrong. */
  confidence: number;
  /**
   * Which parser actually produced this, which is not always the one that was
   * configured: a provider that fails is answered by the mock instead. Reporting
   * the configured name here would be a small lie told on every fallback.
   */
  producedBy: AiProviderName;
};

export type ParseRequest = {
  sentence: string;
  /** Today's date, passed in so "yesterday" resolves the same way everywhere. */
  today: string;
};

export type MonthlySummaryRequest = {
  /**
   * The month as a person would say it: "August 2026", not "2026-08-01".
   *
   * This object exists only to be turned into a sentence, and every consumer of
   * it — the mock's string building, and the JSON handed to a real model — wants
   * the readable form. The ISO date is what the HTTP response carries.
   */
  month: string;
  /** Which currency the figures below are in, so the sentence can name it. */
  baseCurrency: string;
  totalBase: number;
  expenseCount: number;
  byCategory: ReadonlyArray<{ category: string; totalBase: number }>;
  previousTotalBase: number | null;
  /**
   * Whether the stretch before is worth comparing against at all, and why not
   * when it is not. "empty" means nothing was recorded then; "too-small" means
   * something was, but too little for a percentage to describe anything but the
   * accident of a single purchase landing inside the window.
   */
  baseline: Baseline;
};

/**
 * A written summary, and who wrote it.
 *
 * This used to be a bare string. It carries `producedBy` for the same reason
 * `ParseResult` does: a provider that fails is answered by the mock instead, and
 * a page that said "written by Claude" over a sentence the mock produced would
 * be lying on exactly the occasions when the truth is worth knowing.
 */
export type MonthlySummaryResult = {
  summary: string;
  producedBy: AiProviderName;
};

/**
 * The one interface every AI provider implements: the offline mock, and later
 * the Claude and OpenAI adapters. Swapping provider is then a matter of
 * returning a different object, and nothing that calls this has to change.
 *
 * Two methods, because the monthly summary is also an AI call and also has to
 * work with no API key. Leaving it outside this interface would have meant a
 * second, parallel way of choosing a provider.
 */
export interface ExpenseParser {
  readonly name: AiProviderName;
  parseExpense(request: ParseRequest): Promise<ParseResult>;
  summarizeMonth(request: MonthlySummaryRequest): Promise<MonthlySummaryResult>;
  /**
   * Turn a question into a structured query. It answers nothing itself — the
   * backend runs the query and formats the sentence.
   */
  askQuestion(request: AskRequest): Promise<AskResult>;
}

// ---------------------------------------------------------------------------
// Asking questions
// ---------------------------------------------------------------------------

/**
 * The closed grammar a question has to fit into.
 *
 * This union *is* the boundary. A question that can be expressed here is
 * answerable; one that cannot is refused, and there is no third path where
 * something almost fits. That is the whole point: the model chooses which of
 * these shapes was asked for, and the database computes the number. The model
 * never sees an expense and never produces a figure, which is the same division
 * of labour as "the AI never writes to the database".
 *
 * `unsupported` and `looksLikeExpense` are members of the grammar rather than
 * error paths. A model with no legitimate way to decline will decline badly —
 * it will force a bad fit onto whichever shape is closest, and answer a question
 * about money that nobody asked.
 */
export type QuestionMeasure = "total" | "count" | "average";
export type QuestionOrder = "highest" | "lowest";
export type QuestionBucket = "day" | "week" | "month" | "category" | "merchant";

export type QuestionFilters = {
  category?: string | null;
  merchant?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * A question shape that actually produces figures.
 *
 * Named separately from `StructuredQuestion` because a compound question holds
 * a list of these. Keeping the list to *these* three rather than to the whole
 * union is what makes a compound structurally unable to contain a refusal, a
 * signpost, or another compound — the nesting is impossible rather than merely
 * discouraged.
 */
export type AnswerableQuestion =
  /** One number over a filtered set: how much, how many, the average. */
  | { kind: "aggregate"; measure: QuestionMeasure; filters: QuestionFilters }
  /** Individual expenses, ranked by amount. */
  | { kind: "topExpenses"; order: QuestionOrder; limit: number; filters: QuestionFilters }
  /** Grouped into days, weeks, months, categories or shops, then ranked. */
  | {
      kind: "topBuckets";
      bucket: QuestionBucket;
      measure: QuestionMeasure;
      order: QuestionOrder;
      limit: number;
      filters: QuestionFilters;
    };

export type StructuredQuestion =
  /** Outside the grammar. Says so rather than guessing. */
  | { kind: "unsupported"; reason: string }
  /**
   * An amount with no question in it — almost certainly meant for the add box at
   * the top of the page. The most likely mistake with two text boxes on one
   * screen, so it gets a signpost of its own rather than a flat refusal.
   */
  | { kind: "looksLikeExpense" }
  | AnswerableQuestion
  /**
   * More than one thing asked in one sentence, answered part by part.
   *
   * "How much did I spend on restaurants today and where did I spend it" is two
   * questions sharing one set of filters. Each part becomes its own query, each
   * query produces its own figure, and the sentences are joined — no part is
   * dropped and no part is guessed at.
   *
   * `unanswered` names the asks that have no shape at all, so a question that is
   * half answerable says which half it could not do rather than quietly
   * returning the half it could. That was the original bug in a smaller form.
   */
  | { kind: "compound"; parts: AnswerableQuestion[]; unanswered: string[] };

export type AskRequest = {
  question: string;
  today: string;
  baseCurrency: string;
  /**
   * The categories that currently exist, so a model can only filter by one that
   * is really there — and so the mock can match names it was never compiled
   * with.
   */
  categories: readonly string[];
  /** The period the card is showing. Used when the question names no range. */
  from: string;
  to: string;
};

export type AskResult = {
  question: StructuredQuestion;
  producedBy: AiProviderName;
};
