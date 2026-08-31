import { z } from "zod";

/**
 * The nine categories, repeated from the backend.
 *
 * Duplicating a list is normally a mistake. Here the alternative is a shared
 * package between two applications, which is a lot of machinery for nine words
 * that have not changed since the plan was written. If they ever do change, the
 * Zod check below fails loudly rather than quietly showing the wrong thing.
 */
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

const suggestionSchema = z.object({
  amount: z.number().nullable(),
  currency: z.string(),
  merchant: z.string().nullable(),
  category: z.enum(CATEGORY_NAMES),
  description: z.string().nullable(),
  expenseDate: z.string(),
});

const parseResponseSchema = z.object({
  provider: z.string(),
  // The backend promises this endpoint saves nothing. Asserting it here means
  // the promise is checked on every single call rather than trusted.
  saved: z.literal(false),
  confidence: z.number(),
  suggestion: suggestionSchema,
});

const expenseSchema = z.object({
  id: z.string(),
  // Amounts arrive as strings, exactly as the database stores them, so no
  // precision is lost on the way here. They are only turned into numbers for
  // display, at the last possible moment.
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

const expenseListSchema = z.object({
  expenses: z.array(expenseSchema),
  total: z.number(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type ParseResponse = z.infer<typeof parseResponseSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type CategoryName = (typeof CATEGORY_NAMES)[number];

/** An error carrying something worth showing a person. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly fields?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const errorBodySchema = z.object({
  error: z.string(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

/**
 * One place where every call to the backend happens.
 *
 * The reply is validated before it is used. A response from another program is
 * an input from somewhere we do not control, exactly like a request body on the
 * server side, and it gets the same treatment — otherwise a backend change
 * shows up as a blank screen rather than a clear message.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach the server. Is the backend running?");
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(body);
    if (parsed.success) throw new ApiError(parsed.data.error, parsed.data.details);
    throw new ApiError(`The server returned an error (${response.status})`);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("The server sent something this page did not expect");
  }

  return parsed.data;
}

/** Ask the parser what a sentence means. Saves nothing. */
export function parseExpense(sentence: string): Promise<ParseResponse> {
  return request("/api/ai/parse-expense", parseResponseSchema, {
    method: "POST",
    body: JSON.stringify({ sentence }),
  });
}

export type NewExpense = {
  amount: number;
  currency: string;
  merchant: string | null;
  category: CategoryName;
  description: string | null;
  expenseDate: string;
};

/** Save a confirmed expense. This is the only call that writes anything. */
export function createExpense(expense: NewExpense): Promise<Expense> {
  return request("/api/expenses", expenseSchema, {
    method: "POST",
    body: JSON.stringify({ ...expense, source: "web" }),
  });
}

export function listExpenses(limit = 5): Promise<{ expenses: Expense[]; total: number }> {
  return request(`/api/expenses?limit=${limit}`, expenseListSchema);
}

// --- analytics ---------------------------------------------------------------

const summarySchema = z.object({
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
  // Null when there is nothing to compare against, which is different from a
  // change of zero, and the cards say so differently.
  changePercent: z.number().nullable(),
});

const categoryBreakdownSchema = z.object({
  from: z.string(),
  to: z.string(),
  categories: z.array(
    z.object({ category: z.string(), totalEur: z.string(), count: z.number() }),
  ),
});

const trendSchema = z.object({
  from: z.string(),
  to: z.string(),
  bucket: z.string(),
  points: z.array(
    z.object({ weekStart: z.string(), totalEur: z.string(), count: z.number() }),
  ),
});

export type Summary = z.infer<typeof summarySchema>;
export type CategoryBreakdown = z.infer<typeof categoryBreakdownSchema>;
export type Trend = z.infer<typeof trendSchema>;
export type CategorySlice = CategoryBreakdown["categories"][number];
export type TrendPoint = Trend["points"][number];

export function getSummary(): Promise<Summary> {
  return request("/api/analytics/summary", summarySchema);
}

export function getCategories(): Promise<CategoryBreakdown> {
  return request("/api/analytics/categories", categoryBreakdownSchema);
}

export function getTrend(): Promise<Trend> {
  return request("/api/analytics/trend", trendSchema);
}
