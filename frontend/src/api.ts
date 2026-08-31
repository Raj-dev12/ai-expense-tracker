import { z } from "zod";

/**
 * The categories a fresh database starts with, kept only as a fallback for the
 * moment before the real list has loaded.
 *
 * It is no longer *the* list. Categories are rows in a table that the interface
 * can add to and delete from, so anything that needs to know what exists asks
 * GET /api/categories. Validating against this array would refuse a category
 * somebody made thirty seconds ago.
 */
export const DEFAULT_CATEGORY_NAMES = [
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
  // A plain string, not an enum. The categories are data now, so a response
  // naming one this bundle has never heard of is correct rather than corrupt.
  category: z.string(),
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
  amountBase: z.string(),
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
/** A category is whatever the table says it is. */
export type CategoryName = string;

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
      headers: {
        /**
         * Only when there is actually a body.
         *
         * Announcing JSON and then sending nothing is rejected outright —
         * Fastify answers "Body cannot be empty when content-type is set to
         * 'application/json'" — which turned every DELETE from this page into a
         * 400. A DELETE has no body: the expense is named in the path, and the
         * category delete puts its choice in the query string.
         *
         * This is the second time this bug has been fixed in this repository.
         * It was fixed in the MCP server's client in hour 4 and reappeared here,
         * because the browser and the MCP server are separate applications that
         * each build their own requests. Both now have the same guard, and there
         * is a check below that fails if this one is removed.
         */
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
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

/**
 * The fields an edit may carry.
 *
 * Every key is optional, and that is the whole meaning of a PATCH: a key that is
 * absent leaves that field alone. `null` on merchant or description is different
 * again — it means empty this field — which is why they are nullable rather than
 * simply omitted when blank.
 */
export type ExpensePatch = {
  amount?: number;
  currency?: string;
  merchant?: string | null;
  category?: CategoryName;
  description?: string | null;
  expenseDate?: string;
};

/**
 * Change an expense that already exists.
 *
 * The second call on this page that writes anything, and like the first it goes
 * to an endpoint that validates with the same Zod rules the create route uses.
 * No AI is involved in an edit at all — a person is typing directly.
 */
export function updateExpense(id: string, patch: ExpensePatch): Promise<Expense> {
  return request(`/api/expenses/${id}`, expenseSchema, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * List expenses, optionally within a date range.
 *
 * `from` and `to` are the endpoint's own filters, and the day view uses them by
 * pointing both at the same date — a single day is just a range with the same
 * endpoints, so it needs no endpoint of its own. Anything the API can already
 * answer should not grow a second way to ask it.
 */
export function listExpenses(
  options: { limit?: number; from?: string; to?: string } = {},
): Promise<{ expenses: Expense[]; total: number }> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 5) });
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);

  return request(`/api/expenses?${query}`, expenseListSchema);
}

/** Delete an expense. There is no undo, so the interface confirms first. */
export function deleteExpense(id: string): Promise<{ deleted: Expense }> {
  return request(`/api/expenses/${id}`, z.object({ deleted: expenseSchema }), {
    method: "DELETE",
  });
}

// --- categories --------------------------------------------------------------

const categorySchema = z.object({ name: z.string(), expenseCount: z.number() });

const categoryListSchema = z.object({ categories: z.array(categorySchema) });

const categoryDeletionSchema = z.object({
  category: z.string(),
  expenseCount: z.number(),
  mode: z.enum(["reassign", "delete"]),
  reassigned: z.number(),
  deleted: z.number(),
});

export type Category = z.infer<typeof categorySchema>;
export type CategoryDeletion = z.infer<typeof categoryDeletionSchema>;
export type DeleteMode = "reassign" | "delete";

/** The categories that exist, with how many expenses each holds. */
export function getCategoryList(): Promise<{ categories: Category[] }> {
  return request("/api/categories", categoryListSchema);
}

export function createCategory(name: string): Promise<{ name: string }> {
  return request("/api/categories", z.object({ name: z.string() }), {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

const categoryRenameSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** How many expenses had their stored category text rewritten. */
  expensesUpdated: z.number(),
});

export type CategoryRename = z.infer<typeof categoryRenameSchema>;

/**
 * Rename a category and every expense filed under it.
 *
 * The expenses matter here in a way they do not for most renames: they store the
 * category as text, so the server rewrites them in the same transaction. The
 * count comes back so the interface can say what actually happened.
 */
export function renameCategory(name: string, to: string): Promise<CategoryRename> {
  return request(`/api/categories/${encodeURIComponent(name)}`, categoryRenameSchema, {
    method: "PATCH",
    body: JSON.stringify({ name: to }),
  });
}

/**
 * Remove a category, saying what to do with the expenses in it.
 *
 * The mode is required by the API and by this signature, because there is no
 * safe guess: one choice destroys expenses, the other keeps them.
 */
export function deleteCategory(name: string, mode: DeleteMode): Promise<CategoryDeletion> {
  return request(
    `/api/categories/${encodeURIComponent(name)}?expenses=${mode}`,
    categoryDeletionSchema,
    { method: "DELETE" },
  );
}

// --- analytics ---------------------------------------------------------------

const summarySchema = z.object({
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
  // Null when there is nothing to compare against, which is different from a
  // change of zero, and the cards say so differently.
  changePercent: z.number().nullable(),
});

const categoryBreakdownSchema = z.object({
  from: z.string(),
  to: z.string(),
  categories: z.array(
    z.object({ category: z.string(), totalBase: z.string(), count: z.number() }),
  ),
});

const trendSchema = z.object({
  from: z.string(),
  to: z.string(),
  bucket: z.string(),
  points: z.array(
    z.object({ weekStart: z.string(), totalBase: z.string(), count: z.number() }),
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

// --- settings ----------------------------------------------------------------

const settingsSchema = z.object({
  baseCurrency: z.string(),
  /** False until a person has actually picked, rather than been given a default. */
  baseCurrencyChosen: z.boolean(),
  /** Off by default. When off there is one currency and it is the base. */
  conversionEnabled: z.boolean(),
  /** The full ISO 4217 list. */
  currencies: z.array(z.string()),
  convertibleCurrencies: z.array(z.string()),
});

const baseCurrencyChangeSchema = z.object({
  baseCurrency: z.string(),
  previousBaseCurrency: z.string(),
  baseCurrencyChosen: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type BaseCurrencyChange = z.infer<typeof baseCurrencyChangeSchema>;

export function getSettings(): Promise<Settings> {
  return request("/api/settings", settingsSchema);
}

/** Change the currency every total is reported in. */
export function setBaseCurrency(baseCurrency: string): Promise<BaseCurrencyChange> {
  return request("/api/settings", baseCurrencyChangeSchema, {
    method: "PATCH",
    body: JSON.stringify({ baseCurrency }),
  });
}

export function getTrend(): Promise<Trend> {
  return request("/api/analytics/trend", trendSchema);
}

// --- the monthly summary -----------------------------------------------------

const monthlySummarySchema = z.object({
  // Which parser actually wrote the sentence, which on a fallback is the mock
  // rather than whichever provider is configured. The page prints this, so it
  // has to be the truthful one.
  provider: z.string(),
  // The same promise the parse endpoint makes, asserted the same way: asking
  // for a summary must not change anything.
  saved: z.literal(false),
  month: z.string(),
  summary: z.string(),
});

export type MonthlySummary = z.infer<typeof monthlySummarySchema>;

/** Ask for a written summary of this month. Saves nothing. */
export function getMonthlySummary(): Promise<MonthlySummary> {
  return request("/api/ai/monthly-summary", monthlySummarySchema, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
