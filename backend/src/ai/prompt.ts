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
    "You write a short, plain summary of somebody's spending for one month.",
    "Two or three sentences. State the total, the largest category, and how it",
    "compares with the previous month when that figure is given.",
    "No advice, no judgement, no bullet points. The figures carry a baseCurrency",
    "field; report the amounts in that currency and use its symbol.",
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
