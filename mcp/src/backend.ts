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
  amountBase: z.string(),
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
    z.object({ category: z.string(), totalBase: z.string(), count: z.number() }),
  ),
});

export const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  daysElapsed: z.number(),
  totalBase: z.string(),
  count: z.number(),
  dailyAverageBase: z.string(),
  previous: z.object({
    from: z.string(),
    to: z.string(),
    totalBase: z.string(),
    count: z.number(),
  }),
  changePercent: z.number().nullable(),
});

export const deletedSchema = z.object({ deleted: expenseSchema });

export const settingsSchema = z.object({
  baseCurrency: z.string(),
  supportedCurrencies: z.array(z.string()),
});

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

/**
 * Which currency totals are reported in.
 *
 * Asked for rather than assumed, and asked for every time rather than cached.
 * It is a setting a person can change in the browser mid-conversation, and an
 * assistant confidently reporting euros after they switched to pounds would be
 * wrong in the one way that matters here. The extra request is cheap next to
 * the one the tool is already making.
 */
export async function baseCurrency(): Promise<string> {
  return (await call("/api/settings", settingsSchema)).baseCurrency;
}

/** An amount written the way a person reads it, in whatever the base is. */
export function money(value: string | number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatExpense(expense: Expense, base: string): string {
  // The original is worth showing only when it differs from the base; otherwise
  // it is the same number printed twice.
  const original =
    expense.currency === base ? "" : ` (${expense.amount} ${expense.currency})`;
  const where = expense.merchant ?? expense.description ?? "unnamed";
  return `${expense.expenseDate} · ${money(expense.amountBase, base)}${original} · ${where} · ${expense.category} · id ${expense.id}`;
}
