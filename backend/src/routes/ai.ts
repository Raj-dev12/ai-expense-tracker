import type { FastifyPluginAsync } from "fastify";
import { getParser } from "../ai/index.js";
import { monthLabel, todayIso } from "../lib/dates.js";
import { categoryTotalsBetween, monthToDate } from "../lib/figures.js";
import { HttpError } from "../lib/http-error.js";
import { getDemoUserId } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import {
  monthlySummaryRequestSchema,
  monthlySummaryResultSchema,
  parseExpenseRequestSchema,
  parseResultSchema,
} from "../schemas/ai.js";

export const aiRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Turn a sentence into a suggested expense.
   *
   * This endpoint saves nothing, and that is the entire point of it. It reads,
   * it guesses, it replies. The browser shows the guess, a person corrects and
   * confirms it, and only then does anything reach POST /api/expenses — which
   * validates the result again without caring that an AI was ever involved.
   *
   * If this route ever writes to the database, the safety pattern is gone.
   */
  app.post("/api/ai/parse-expense", async (request) => {
    const input = validate(parseExpenseRequestSchema, request.body, "sentence");
    const parser = getParser();

    const result = await parser.parseExpense({
      sentence: input.sentence,
      today: input.today ?? todayIso(),
    });

    // The parser's own output is validated before it leaves the building. A
    // failure here is the provider's fault rather than the caller's, which is
    // why it is a 502 and not a 400.
    const checked = parseResultSchema.safeParse(result);
    if (!checked.success) {
      request.log.error(
        { provider: parser.name, issues: checked.error.issues },
        "parser returned something unusable",
      );
      throw new HttpError(502, "The parser returned something unusable");
    }

    return {
      // Who actually answered, which on a fallback is the mock rather than the
      // provider named in the configuration.
      provider: checked.data.producedBy,
      // Stated explicitly, because it is the promise this endpoint makes.
      saved: false,
      confidence: checked.data.confidence,
      suggestion: checked.data.suggestion,
    };
  });

  /**
   * Write a couple of sentences about this month's spending.
   *
   * Like the parse endpoint, this saves nothing — it reads figures and returns
   * prose. It is the second AI feature, and it obeys the same two rules as the
   * first: the reply is validated before it leaves, and the response names the
   * provider that actually answered rather than the one configured.
   *
   * The figures come from lib/figures.ts, which is where the dashboard cards get
   * theirs. That is deliberate: the sentence describes the same numbers the
   * cards are showing, so the two cannot disagree on screen.
   */
  app.post("/api/ai/monthly-summary", async (request) => {
    validate(monthlySummaryRequestSchema, request.body ?? {}, "request");

    const userId = await getDemoUserId();
    const figures = await monthToDate(userId);
    const categories = await categoryTotalsBetween(userId, figures.from, figures.to);

    const parser = getParser();
    const result = await parser.summarizeMonth({
      month: monthLabel(figures.from),
      // The parser is handed numbers rather than the decimal strings, because it
      // is writing a sentence rather than storing anything. Nothing is written
      // back from this call, so no precision reaches the database this way.
      totalEur: Number(figures.totalEur),
      expenseCount: figures.count,
      byCategory: categories.map((row) => ({
        category: row.category,
        totalEur: Number(row.totalEur),
      })),
      previousMonthTotalEur:
        figures.previous.count > 0 ? Number(figures.previous.totalEur) : null,
    });

    const checked = monthlySummaryResultSchema.safeParse(result);
    if (!checked.success) {
      request.log.error(
        { provider: parser.name, issues: checked.error.issues },
        "parser returned an unusable summary",
      );
      throw new HttpError(502, "The parser returned an unusable summary");
    }

    return {
      provider: checked.data.producedBy,
      saved: false,
      month: figures.from,
      summary: checked.data.summary,
    };
  });
};
