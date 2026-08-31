import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "../env.js";
import { structuredQuestionSchema } from "../schemas/ai.js";
import {
  aiExpenseSchema,
  askSystemPrompt,
  parseSystemPrompt,
  summarySystemPrompt,
  toValidatedResult,
} from "./prompt.js";
import type {
  AskRequest,
  AskResult,
  ExpenseParser,
  MonthlySummaryRequest,
  MonthlySummaryResult,
  ParseRequest,
  ParseResult,
} from "./types.js";

/**
 * The OpenAI adapter.
 *
 * Same job, same prompt, same validation as the Claude one — only the SDK calls
 * differ. That symmetry is the point of having an interface: the rest of the
 * application cannot tell which of these is running.
 */
export function createOpenAiParser(apiKey: string): ExpenseParser {
  const client = new OpenAI({
    apiKey,
    timeout: env.AI_TIMEOUT_MS,
    maxRetries: 1,
  });

  return {
    name: "openai",

    async parseExpense({ sentence, today }: ParseRequest): Promise<ParseResult> {
      const response = await client.responses.parse({
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: parseSystemPrompt(today) },
          { role: "user", content: sentence },
        ],
        text: { format: zodTextFormat(aiExpenseSchema, "expense") },
      });

      const parsed = response.output_parsed;
      if (!parsed) throw new Error("OpenAI returned no parsed output");

      return toValidatedResult(parsed, sentence, "openai");
    },

    /**
     * Turn a question into a structured query. It answers nothing: the shape it
     * returns is run against the database, which is what keeps a model away from
     * arithmetic about somebody's money.
     */
    async askQuestion(request: AskRequest): Promise<AskResult> {
      const response = await client.responses.parse({
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: askSystemPrompt(request) },
          { role: "user", content: request.question },
        ],
        text: { format: zodTextFormat(structuredQuestionSchema, "question") },
      });

      const parsed = response.output_parsed;
      if (!parsed) throw new Error("OpenAI returned no parsed output");

      // Validated again in the route, like every other parser result. The SDK
      // promises the shape; our own schema is what decides it is acceptable.
      return { question: parsed as AskResult["question"], producedBy: "openai" };
    },

    async summarizeMonth(request: MonthlySummaryRequest): Promise<MonthlySummaryResult> {
      const response = await client.responses.create({
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: summarySystemPrompt() },
          { role: "user", content: JSON.stringify(request) },
        ],
      });

      const text = response.output_text?.trim();
      if (!text) throw new Error("OpenAI returned an empty summary");

      return { summary: text, producedBy: "openai" };
    },
  };
}
