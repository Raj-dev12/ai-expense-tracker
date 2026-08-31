import { env } from "../env.js";
import { createClaudeParser } from "./claude.js";
import { withMockFallback } from "./fallback.js";
import { mockParser } from "./mock.js";
import { createOpenAiParser } from "./openai.js";
import type { ExpenseParser } from "./types.js";

// Built once. The client objects hold connection pools, so making a new one per
// request would be wasteful; the choice cannot change while the server runs.
let parser: ExpenseParser | null = null;

function build(): ExpenseParser {
  if (env.AI_PROVIDER === "claude") {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn('AI_PROVIDER is "claude" but ANTHROPIC_API_KEY is not set. Using the mock parser.');
      return mockParser;
    }
    return withMockFallback(createClaudeParser(env.ANTHROPIC_API_KEY));
  }

  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      console.warn('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set. Using the mock parser.');
      return mockParser;
    }
    return withMockFallback(createOpenAiParser(env.OPENAI_API_KEY));
  }

  return mockParser;
}

/**
 * Chooses the parser from AI_PROVIDER, defaulting to the offline mock.
 *
 * A missing key is not an error. The whole app is supposed to run with nothing
 * configured, so asking for a provider you have no key for warns and carries on
 * rather than refusing to start.
 */
export function getParser(): ExpenseParser {
  if (!parser) parser = build();
  return parser;
}

export type { ExpenseParser } from "./types.js";
