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
  category: CategoryName;
  description: string | null;
  expenseDate: string;
};

export type ParseResult = {
  suggestion: ExpenseSuggestion;
  /** 0 to 1. Never 1 — the whole design assumes the parser can be wrong. */
  confidence: number;
};

export type ParseRequest = {
  sentence: string;
  /** Today's date, passed in so "yesterday" resolves the same way everywhere. */
  today: string;
};

export type MonthlySummaryRequest = {
  month: string;
  totalEur: number;
  expenseCount: number;
  byCategory: ReadonlyArray<{ category: string; totalEur: number }>;
  previousMonthTotalEur: number | null;
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
  summarizeMonth(request: MonthlySummaryRequest): Promise<string>;
}
