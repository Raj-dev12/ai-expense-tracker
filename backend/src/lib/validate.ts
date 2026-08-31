import type { ZodType } from "zod";
import { HttpError } from "./http-error.js";

/**
 * Runs a Zod schema over untrusted data and either returns the clean, typed
 * result or throws a 400.
 *
 * Every input crossing into this application goes through here: HTTP bodies,
 * query strings, URL parameters, and later the AI's replies and the MCP
 * server's arguments. Validating at the boundary means the rest of the code can
 * trust what it is holding.
 */
export function validate<T extends ZodType>(schema: T, data: unknown, what: string): T["_output"] {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new HttpError(
      400,
      `Invalid ${what}`,
      result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    );
  }

  return result.data;
}
