import { mockParser } from "./mock.js";
import type {
  ExpenseParser,
  MonthlySummaryRequest,
  MonthlySummaryResult,
  ParseRequest,
  ParseResult,
} from "./types.js";

/**
 * Wraps a real provider so that any failure quietly becomes a mock result.
 *
 * Covers everything that can go wrong on the far side of a network call: the
 * provider being down, a rate limit, an expired key, a request that takes longer
 * than the timeout, and a reply that fails our own validation. All of them end
 * the same way — the person gets a slightly worse suggestion instead of an
 * error, and still confirms it themselves before anything is saved.
 *
 * The failure is logged; the key never is. See `redact` below — that is not
 * theoretical tidiness, it is fixing something this code actually did.
 */

/**
 * Strip anything key-shaped out of a message before it reaches a log.
 *
 * Providers quote the offending key back in authentication errors. OpenAI masks
 * the middle — "sk-inval*******************only" — but the first and last
 * characters survive, and a log file is exactly the place a secret should never
 * end up. Logs get copied into issues, screenshots and support threads.
 */
function redact(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-[redacted]");
}

export function withMockFallback(parser: ExpenseParser): ExpenseParser {
  function report(action: string, error: unknown): void {
    const reason = error instanceof Error ? redact(error.message) : "unknown error";
    console.warn(`${parser.name} ${action} failed, falling back to the mock: ${reason}`);
  }

  return {
    name: parser.name,

    async parseExpense(request: ParseRequest): Promise<ParseResult> {
      try {
        return await parser.parseExpense(request);
      } catch (error) {
        report("parse", error);
        return mockParser.parseExpense(request);
      }
    },

    async summarizeMonth(request: MonthlySummaryRequest): Promise<MonthlySummaryResult> {
      try {
        return await parser.summarizeMonth(request);
      } catch (error) {
        report("summary", error);
        // The mock's own result says `producedBy: "mock"`, so the page ends up
        // telling the truth about who wrote the sentence without this wrapper
        // having to say anything.
        return mockParser.summarizeMonth(request);
      }
    },
  };
}
