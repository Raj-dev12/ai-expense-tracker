import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
 * The Claude adapter.
 *
 * Structured output does the heavy lifting: the model is handed a JSON schema
 * generated from our Zod schema and cannot reply with a different shape. That
 * removes the most common failure mode — a model returning prose, or JSON
 * wrapped in a code fence — but not the interesting ones, so the reply is still
 * validated properly before anyone sees it.
 */
export function createClaudeParser(apiKey: string): ExpenseParser {
  const client = new Anthropic({
    apiKey,
    // Milliseconds in the TypeScript SDK. A demo should not sit waiting: if the
    // provider is slow, falling back to the mock is a better outcome than a
    // spinner nobody trusts.
    timeout: env.AI_TIMEOUT_MS,
    maxRetries: 1,
  });

  return {
    name: "claude",

    async parseExpense({ sentence, today }: ParseRequest): Promise<ParseResult> {
      const response = await client.messages.parse({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: parseSystemPrompt(today),
        messages: [{ role: "user", content: sentence }],
        output_config: {
          format: zodOutputFormat(aiExpenseSchema),
          // Reading one short sentence does not need deep reasoning, and this
          // endpoint sits in front of somebody waiting to press confirm.
          effort: "low",
        },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to answer this request");
      }

      const parsed = response.parsed_output;
      if (!parsed) throw new Error("Claude returned no parsed output");

      return toValidatedResult(parsed, sentence, "claude");
    },

    /**
     * Turn a question into a structured query. It answers nothing: the shape it
     * returns is run against the database, which is what keeps a model away from
     * arithmetic about somebody's money.
     */
    async askQuestion(request: AskRequest): Promise<AskResult> {
      const response = await client.messages.parse({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: askSystemPrompt(request),
        messages: [{ role: "user", content: request.question }],
        output_config: { format: zodOutputFormat(structuredQuestionSchema), effort: "low" },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to answer this request");
      }

      const parsed = response.parsed_output;
      if (!parsed) throw new Error("Claude returned no parsed output");

      // Validated again in the route, like every other parser result. The SDK
      // promises the shape; our own schema is what decides it is acceptable.
      return { question: parsed as AskResult["question"], producedBy: "claude" };
    },

    async summarizeMonth(request: MonthlySummaryRequest): Promise<MonthlySummaryResult> {
      const response = await client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: summarySystemPrompt(),
        messages: [{ role: "user", content: JSON.stringify(request) }],
        output_config: { effort: "low" },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Claude declined to answer this request");
      }

      // content is a list of blocks of different kinds; only the text ones are
      // wanted here.
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();

      if (!text) throw new Error("Claude returned an empty summary");

      return { summary: text, producedBy: "claude" };
    },
  };
}
