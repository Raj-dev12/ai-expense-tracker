import type { FastifyPluginAsync } from "fastify";
import { getParser } from "../ai/index.js";
import { todayIso } from "../lib/dates.js";
import { HttpError } from "../lib/http-error.js";
import { validate } from "../lib/validate.js";
import { parseExpenseRequestSchema, parseResultSchema } from "../schemas/ai.js";

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
};
