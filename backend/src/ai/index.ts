import { env } from "../env.js";
import { mockParser } from "./mock.js";
import type { ExpenseParser } from "./types.js";

let warnedAboutMissingAdapter = false;

/**
 * Chooses the parser from the AI_PROVIDER environment variable.
 *
 * The Claude and OpenAI adapters are not built yet. Until they are, asking for
 * one falls back to the mock with a warning rather than refusing to start: the
 * app is supposed to run fully with nothing configured, and a demo that dies
 * because of a setting is worse than one that says what it is doing.
 */
export function getParser(): ExpenseParser {
  if (env.AI_PROVIDER === "mock") return mockParser;

  if (!warnedAboutMissingAdapter) {
    console.warn(
      `AI_PROVIDER is "${env.AI_PROVIDER}", but that adapter has not been built yet. Using the mock parser.`,
    );
    warnedAboutMissingAdapter = true;
  }

  return mockParser;
}

export type { ExpenseParser } from "./types.js";
