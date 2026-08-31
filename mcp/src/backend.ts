import { z } from "zod";

/**
 * The MCP server's only way of touching anything.
 *
 * It calls the backend's HTTP API and never the database. That is the whole
 * point of the arrangement: the rules about what a valid expense is — the
 * categories, the currencies, the amount limits, the date checks — live in one
 * place, on the server, and an AI assistant goes through exactly the same door
 * as the browser does. A second path into the database would be a second copy of
 * those rules, and the two would drift.
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 10_000;

export const CATEGORY_NAMES = [
  "Groceries",
  "Restaurants",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Travel",
  "Other",
] as const;

export const CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "JPY", "CAD", "AUD",
] as const;

export const expenseSchema = z.object({
  id: z.string(),
  amount: z.string(),
  currency: z.string(),
  amountEur: z.string(),
  merchant: z.string().nullable(),
  category: z.string(),
  description: z.string().nullable(),
  expenseDate: z.string(),
  createdAt: z.string(),
  source: z.string(),
});

export const expenseListSchema = z.object({
  expenses: z.array(expenseSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const categoryBreakdownSchema = z.object({
  from: z.string(),
  to: z.string(),
  categories: z.array(
    z.object({ category: z.string(), totalEur: z.string(), count: z.number() }),
  ),
});

export const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  daysElapsed: z.number(),
  totalEur: z.string(),
  count: z.number(),
  dailyAverageEur: z.string(),
  previous: z.object({
    from: z.string(),
    to: z.string(),
    totalEur: z.string(),
    count: z.number(),
  }),
  changePercent: z.number().nullable(),
});

export const deletedSchema = z.object({ deleted: expenseSchema });

export type Expense = z.infer<typeof expenseSchema>;

/** An error with a message worth showing the person on the other end. */
export class BackendError extends Error {}

const errorBodySchema = z.object({
  error: z.string(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

/**
 * One request to the backend, with the reply validated before it is used.
 *
 * A response from another program is an input from somewhere this code does not
 * control, so it gets checked like any other. Without that, a backend change
 * would surface here as an assistant confidently reporting nonsense.
 */
export async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: {
        // Only when there is actually a body. Announcing JSON and then sending
        // nothing is rejected outright — a DELETE has no body, and saying it
        // does turned "no such expense" into a confusing complaint about
        // content types.
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new BackendError(
      `Could not reach the expense tracker at ${BACKEND_URL} (${reason}). Is it running?`,
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) {
      const details = (parsed.data.details ?? [])
        .map((detail) => `${detail.field}: ${detail.message}`)
        .join("; ");
      throw new BackendError(details ? `${parsed.data.error} — ${details}` : parsed.data.error);
    }
    throw new BackendError(`The expense tracker returned an error (${response.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BackendError("The expense tracker sent a reply this tool did not understand");
  }

  return parsed.data;
}

/** Build a query string, leaving out anything that was not given. */
export function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

/**
 * Today, in the same time zone the backend uses.
 *
 * The assistant may be running anywhere, and an expense recorded at 11pm should
 * land on the day the person thinks it is.
 */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatExpense(expense: Expense): string {
  const original =
    expense.currency === "EUR" ? "" : ` (${expense.amount} ${expense.currency})`;
  const where = expense.merchant ?? expense.description ?? "unnamed";
  return `${expense.expenseDate} · €${expense.amountEur}${original} · ${where} · ${expense.category} · id ${expense.id}`;
}
