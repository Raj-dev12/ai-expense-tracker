import {
  findAmount,
  findCategory,
  findCurrencyAnywhere,
  findDate,
  findMerchant,
  removeFirst,
} from "./extract.js";
import { formatMoney } from "../lib/money.js";
import type {
  ExpenseParser,
  MonthlySummaryRequest,
  MonthlySummaryResult,
  ParseRequest,
  ParseResult,
} from "./types.js";

/**
 * The offline parser. No network, no API key, no cost.
 *
 * It is deliberately imperfect: regular expressions and keyword lists, not
 * understanding. That is the point — it proves the confirm step earns its place,
 * and it means the whole app runs for anyone who clones the repository with
 * nothing configured.
 *
 * The individual rules live in extract.ts. What lives here is the *order* they
 * run in, and the removal of each match before the next one runs, which is the
 * part that stops two individually-correct rules from fighting over the same
 * characters. The reasoning is written out at the top of extract.ts.
 */
export const mockParser: ExpenseParser = {
  name: "mock",

  async parseExpense({ sentence, today }: ParseRequest): Promise<ParseResult> {
    const trimmed = sentence.trim();

    // 1. The date. Most constrained, so it goes first: three numbers in a fixed
    //    shape with day and month ranges. "31,08,26" is also a well-formed
    //    grouped number, and reading it as a date is only possible if nothing
    //    has read it as a number first.
    const date = findDate(trimmed, today);
    const withoutDate = removeFirst(trimmed, date.matched);

    // 2. The amount, from what the date did not use.
    const amount = findAmount(withoutDate);
    const withoutAmount = removeFirst(withoutDate, amount.matched);

    // 3. The merchant, from whatever is genuinely left over. It no longer has to
    //    ask whether a word looks like a number or a currency, because anything
    //    that was one has already been taken away.
    const merchant = findMerchant(withoutAmount);
    const withoutMerchant = merchant.words.reduce(
      (text, word) => removeFirst(text, word),
      withoutAmount,
    );

    // 4. A currency named on its own, as in "paid 20 in dollars". This runs last
    //    because a shop called "Euro Shop" should keep its name: a preposition
    //    pointing at a merchant is stronger evidence than a bare word that
    //    happens to be a currency.
    const currency =
      amount.currency ?? findCurrencyAnywhere(withoutMerchant) ?? "EUR";

    // The category is read from the whole sentence rather than the leftovers,
    // because it is a property of the sentence rather than a span of it.
    const { category, matched: categoryMatched } = findCategory(trimmed);

    // Confidence is a rough tally of how much was actually recognised rather
    // than assumed. It is capped below 1 on purpose: this parser is never
    // certain, and a number that reads as "definitely" would quietly undermine
    // the confirm step it exists to justify.
    let confidence = 0.3;
    if (amount.amount !== null) confidence += 0.25;
    if (amount.currency) confidence += 0.1;
    if (categoryMatched) confidence += 0.15;
    if (merchant.name) confidence += 0.1;
    if (date.explicit) confidence += 0.1;

    return {
      suggestion: {
        amount: amount.amount,
        currency,
        merchant: merchant.name,
        category,
        // The original sentence is kept as the description, so nothing the
        // person typed is lost between typing and confirming.
        description: trimmed.slice(0, 500),
        expenseDate: date.date,
      },
      confidence: Math.min(Math.round(confidence * 100) / 100, 0.95),
      producedBy: "mock",
    };
  },

  async summarizeMonth(request: MonthlySummaryRequest): Promise<MonthlySummaryResult> {
    const { month, baseCurrency, totalBase, expenseCount, byCategory, previousTotalBase } =
      request;

    if (expenseCount === 0) {
      return { summary: `${month}: nothing recorded.`, producedBy: "mock" };
    }

    const ranked = [...byCategory].sort((a, b) => b.totalBase - a.totalBase);
    const biggest = ranked[0];
    const sentences: string[] = [
      `${month} you spent ${formatMoney(totalBase, baseCurrency)} across ${expenseCount} ${
        expenseCount === 1 ? "expense" : "expenses"
      }.`,
    ];

    if (biggest) {
      const share = totalBase > 0 ? Math.round((biggest.totalBase / totalBase) * 100) : 0;
      sentences.push(
        `${biggest.category} was the largest category at ${formatMoney(biggest.totalBase, baseCurrency)}, about ${share}% of the total.`,
      );
    }

    if (previousTotalBase !== null && previousTotalBase > 0) {
      const difference = totalBase - previousTotalBase;
      const percent = Math.abs(Math.round((difference / previousTotalBase) * 100));
      sentences.push(
        difference >= 0
          ? `That is ${percent}% more than the stretch before it.`
          : `That is ${percent}% less than the stretch before it.`,
      );
    }

    return { summary: sentences.join(" "), producedBy: "mock" };
  },
};
