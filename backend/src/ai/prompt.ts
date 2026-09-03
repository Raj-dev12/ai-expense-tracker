import { z } from "zod";
import { CATEGORY_NAMES } from "../lib/categories.js";
import { SUPPORTED_CURRENCIES } from "../fx/rates.js";
import { parseResultSchema } from "../schemas/ai.js";
import type { AiProviderName, ParseResult } from "./types.js";

/**
 * The shape both real providers are asked to fill in.
 *
 * Deliberately plain — nullable fields, an enum, and strings. Both SDKs turn
 * this Zod schema into a JSON schema the model must obey, and a JSON schema
 * cannot express things like "not in the future". Those rules are checked
 * afterwards by our own validation instead, which is stricter than anything the
 * model could be asked to promise.
 */
export const aiExpenseSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string(),
  merchant: z.string().nullable(),
  category: z.enum(CATEGORY_NAMES),
  expenseDate: z.string(),
  confidence: z.number(),
});

export type AiExpense = z.infer<typeof aiExpenseSchema>;

/** The instructions given to a real model. Shared, so both adapters behave alike. */
export function parseSystemPrompt(today: string): string {
  return [
    "You turn a short sentence about a purchase into structured data.",
    "",
    `Today is ${today}. Resolve relative dates such as "yesterday", "last friday" or`,
    '"3 days ago" against it, and return expenseDate as YYYY-MM-DD.',
    "Never return a date in the future.",
    "",
    `Choose exactly one category from: ${CATEGORY_NAMES.join(", ")}.`,
    'Use "Other" when none of them fit.',
    "",
    `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    "Use EUR when the sentence does not mention a currency.",
    "",
    "amount is the number spent. Return null if the sentence contains no amount.",
    "merchant is the shop or company name. Return null if none is named.",
    "Never invent an amount or a merchant. A null is more useful than a guess,",
    "because a person checks this before anything is saved.",
    "",
    "confidence is between 0 and 1: how much of this you read from the sentence",
    "rather than assumed.",
  ].join("\n");
}

export function summarySystemPrompt(): string {
  return [
    "You write a short, plain summary of somebody's spending over one period,",
    "which may be a day, a week, a month, a quarter, a half year or a year.",
    "Two or three sentences. State the total, the largest category, and how it",
    "compares with the stretch of the same length before it. Do not call that",
    "stretch a month unless the period itself is one. The baseline field says",
    "whether that comparison is worth making: on 'usable', state the change; on",
    "'empty', say there is nothing before it to compare against; on 'too-small',",
    "say there is too little before it for a comparison to mean anything; on",
    "'not-comparable', say a self-chosen range has nothing natural to compare",
    "against.",
    "Never compute a percentage against a baseline the field has not called",
    "usable, and never leave the comparison out silently — a missing sentence",
    "reads as spending that did not change.",
    "The month field is a phrase with its preposition already in it, such as",
    "'In August 2026' or 'On 31 August 2026' — open with it rather than adding",
    "your own. No advice, no judgement, no bullet points. The figures carry a",
    "baseCurrency field; report the amounts in that currency and use its symbol.",
  ].join("\n");
}

/**
 * Turn a model's answer into a validated result, or throw.
 *
 * This is the boundary. Everything above this line came from outside and is not
 * trusted: the model can return a category that does not exist, a negative
 * amount, a date next year, or a currency we cannot convert. Anything that fails
 * here throws, and the caller falls back to the mock — which is why a bad reply
 * from a provider degrades the demo instead of breaking it.
 */
export function toValidatedResult(
  raw: AiExpense,
  sentence: string,
  producedBy: AiProviderName,
): ParseResult {
  const candidate = {
    suggestion: {
      amount: raw.amount,
      currency: raw.currency,
      merchant: raw.merchant?.trim() ? raw.merchant.trim() : null,
      category: raw.category,
      description: sentence.trim().slice(0, 500),
      expenseDate: raw.expenseDate,
    },
    // Clamped to the same ceiling the mock uses. No parser gets to claim
    // certainty, however confident it says it is.
    confidence: Math.min(Math.max(raw.confidence, 0), 0.95),
    producedBy,
  };

  const checked = parseResultSchema.safeParse(candidate);

  if (!checked.success) {
    const problems = checked.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Model returned values that failed validation — ${problems}`);
  }

  return checked.data;
}

/**
 * What a model is told before it turns a question into a query.
 *
 * The categories are listed because a filter naming one that does not exist is
 * refused, and a model that has to guess will guess "Food". Today's date is
 * there so "this month" means something. The default window is stated so a
 * question that names no dates inherits the period the card is showing.
 *
 * The last paragraph is the important one. A model with no legitimate way to
 * decline will force a bad fit onto whichever shape is closest and answer a
 * question about money that nobody asked.
 */
export function askSystemPrompt(request: {
  today: string;
  baseCurrency: string;
  categories: readonly string[];
  from: string;
  to: string;
}): string {
  return [
    "You turn a question about somebody's expenses into a structured query.",
    "You never answer the question yourself and you never invent a figure: the",
    "database runs your query and writes the sentence.",
    "",
    `Today is ${request.today}. Amounts are in ${request.baseCurrency}.`,
    `If the question names no dates, leave from and to null and the query runs`,
    `over ${request.from} to ${request.to}.`,
    "",
    `The categories that exist are: ${request.categories.join(", ")}.`,
    "Only ever use a category from that list. Never invent one.",
    "",
    "Choose one kind:",
    "- aggregate: one number over a filtered set (total, count or average).",
    "- topExpenses: individual expenses ranked by amount, highest or lowest.",
    "- topBuckets: grouped into day, week, month, category or merchant, then",
    "  ranked by total, count or average.",
    "- compound: the question asks more than one thing — 'how much did I spend",
    "  on restaurants today and where did I spend it'. Put one part in `parts`",
    "  per thing asked, in the order the sentence asks them, each a complete",
    "  aggregate, topExpenses or topBuckets query. Every part carries the same",
    "  filters the whole sentence sets: in that example the 'it' means the",
    "  restaurant spending of that day, so both parts filter on Restaurants and",
    "  on today. Name in `unanswered` any part you cannot express as a query.",
    "  Never return a single part for a question that asked two things, and",
    "  never answer one part while ignoring the other.",
    "- looksLikeExpense: the text states a purchase rather than asking anything,",
    "  for example '42 euros at Lidl yesterday'. It belongs in the add box.",
    "- unsupported: anything else, with a short reason.",
    "",
    "Return unsupported rather than approximating. Questions about why, about",
    "the future, about budgets, and requests for advice are all unsupported. If",
    "the question narrows the answer in a way you cannot express in the filters",
    "— a shop you cannot name, a stretch of time you cannot pin down — return",
    "unsupported rather than answering the wider question instead.",
  ].join("\n");
}
