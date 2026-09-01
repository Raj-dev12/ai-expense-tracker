import type { FastifyPluginAsync } from "fastify";
import { getParser } from "../ai/index.js";
import { isConversionEnabled } from "../fx/rates.js";
import { categoryNames } from "../lib/category-store.js";
import { UNCATEGORISED } from "../lib/categories.js";
import { describeQuestion, formatAnswer } from "../lib/answer.js";
import { startOfMonth, todayIso, windowLabel } from "../lib/dates.js";
import { resolveFilters, runQuestion } from "../lib/insights.js";
import { categoryTotalsBetween, monthToDate, periodFigures } from "../lib/figures.js";
import { HttpError } from "../lib/http-error.js";
import { getDemoUser } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import {
  askRequestSchema,
  askResultSchema,
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
    const { baseCurrency } = await getDemoUser();
    const available = await categoryNames();
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
      // The suggestion is shown to a person who then confirms it, so it has to
      // describe what will actually be stored rather than what the sentence said.
      suggestion: {
        ...checked.data.suggestion,
        // The parsers guess from a fixed vocabulary of words; the categories are
        // editable. A guess of "Travel" after somebody deleted Travel would be a
        // suggestion the confirm step could not save, so it falls back to
        // Uncategorised — still editable, and still nothing is stored either way.
        category: available.includes(checked.data.suggestion.category)
          ? checked.data.suggestion.category
          : UNCATEGORISED,
        // With conversion off there is one currency and it is the base, whatever
        // the sentence said.
        currency: isConversionEnabled() ? checked.data.suggestion.currency : baseCurrency,
      },
    };
  });

  /**
   * Answer a question about the expenses.
   *
   * The model's only job is to say *which* of five shapes was asked for. It
   * never sees an expense row and never produces a figure — the query it
   * returns is validated here, run as SQL, and written up from a template. That
   * is the same division as "the AI never writes to the database": here it is
   * the AI never computes the money.
   *
   * Three ways this ends without an answer, and they are deliberately different:
   * the grammar has a `unsupported` member for a question outside it, a
   * `looksLikeExpense` member for text that belongs in the add box, and a 502
   * for a reply that fails validation. Only the last of those is a fault.
   */
  app.post("/api/ai/ask", async (request) => {
    const input = validate(askRequestSchema, request.body, "question");
    const { id: userId, baseCurrency } = await getDemoUser();

    const today = todayIso();
    const window = {
      from: input.from ?? startOfMonth(today),
      to: input.to ?? today,
    };

    const parser = getParser();
    const result = await parser.askQuestion({
      question: input.question,
      today,
      baseCurrency,
      // Read fresh, so a filter can only name a category that really exists.
      categories: await categoryNames(),
      ...window,
    });

    const checked = askResultSchema.safeParse(result);
    if (!checked.success) {
      request.log.error(
        { provider: parser.name, issues: checked.error.issues },
        "parser returned an unusable question",
      );
      throw new HttpError(502, "The parser returned something unusable");
    }

    const question = checked.data.question;
    const base = { provider: checked.data.producedBy, saved: false as const };

    if (question.kind === "looksLikeExpense") {
      return {
        ...base,
        answerable: false,
        looksLikeExpense: true,
        answer: "That looks like an expense rather than a question.",
        reading: null,
      };
    }

    if (question.kind === "unsupported") {
      return {
        ...base,
        answerable: false,
        looksLikeExpense: false,
        answer: question.reason,
        reading: null,
      };
    }

    // A category that does not exist is a 400 naming the ones that do, never a
    // silently empty answer — which would read as "you spent nothing on that".
    const filters = await resolveFilters(question.filters, window);
    const answer = await runQuestion(userId, question, filters);

    return {
      ...base,
      answerable: true,
      looksLikeExpense: false,
      answer: formatAnswer(answer, question, filters, baseCurrency),
      reading: describeQuestion(question, filters),
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
    const input = validate(monthlySummaryRequestSchema, request.body ?? {}, "request");

    const { id: userId, baseCurrency } = await getDemoUser();

    const today = todayIso();
    const figures =
      input.from || input.to
        ? await periodFigures(userId, input.from ?? startOfMonth(today), input.to ?? today)
        : await monthToDate(userId);

    const categories = await categoryTotalsBetween(userId, figures.from, figures.to);

    const parser = getParser();
    const result = await parser.summarizeMonth({
      // The label describes whatever window was asked for, so a quarter does not
      // come back described as a month.
      month: windowLabel(figures.from, figures.to),
      baseCurrency,
      // The parser is handed numbers rather than the decimal strings, because it
      // is writing a sentence rather than storing anything. Nothing is written
      // back from this call, so no precision reaches the database this way.
      totalBase: Number(figures.totalBase),
      expenseCount: figures.count,
      byCategory: categories.map((row) => ({
        category: row.category,
        totalBase: Number(row.totalBase),
      })),
      // Null unless the stretch before is actually worth comparing against.
      // The reason travels alongside it, so the sentence can say which of the
      // two silences this is rather than simply omitting the comparison.
      previousTotalBase:
        figures.baseline === "usable" ? Number(figures.previous.totalBase) : null,
      baseline: figures.baseline,
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
      from: figures.from,
      to: figures.to,
      summary: checked.data.summary,
    };
  });
};
