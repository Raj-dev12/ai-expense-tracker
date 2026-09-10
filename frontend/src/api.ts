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
  // Null when the parser found something meant to be a date and could not read
  // it — not when the sentence named no date, which comes back as today. The
  // confirm step leaves the box empty and will not save until it is filled in.
  expenseDate: z.string().nullable(),
  /** Why there is no date, quoting the text that failed. Null when there is one. */
  dateNote: z.string().nullable(),
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
/**
 * Where a row the browser creates came from.
 *
 * Only these two: a sentence somebody typed, or a receipt they photographed. The
 * other values the server accepts belong to the MCP server and the seed script,
 * and this page has no business claiming either.
 */
export type ExpenseSource = "web" | "receipt";

export function createExpense(
  expense: NewExpense,
  source: ExpenseSource = "web",
): Promise<Expense> {
  return request("/api/expenses", expenseSchema, {
    method: "POST",
    body: JSON.stringify({ ...expense, source }),
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
  options: {
    limit?: number;
    from?: string;
    to?: string;
    /**
     * One category, or the whole set a folded pie slice stands for. Sent as a
     * repeated `category` key, which is what the backend filter reads.
     *
     * A list rather than a string because the pie folds its smallest categories
     * into one slice: clicking it has to ask for exactly the categories that
     * were drawn, not for the literal name "Other" — which is also a real
     * category, and answering with only that one is what made the tooltip and
     * the panel disagree about the same slice.
     */
    categories?: readonly string[];
  } = {},
): Promise<{ expenses: Expense[]; total: number }> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 5) });
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  // append, not set: every name has to survive into the query string.
  for (const name of options.categories ?? []) query.append("category", name);

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
  // Why there is no percentage, when there is none. "empty" and "too-small" are
  // different silences and the card says which.
  baseline: z.enum(["usable", "empty", "too-small", "not-comparable"]),
});

const categoryBreakdownSchema = z.object({
  from: z.string(),
  to: z.string(),
  categories: z.array(
    z.object({ category: z.string(), totalBase: z.string(), count: z.number() }),
  ),
});

/**
 * One total per day that has spending, for the calendar grid.
 *
 * Days with nothing in them are simply absent, so the grid fills its own gaps.
 * Totals arrive as strings like every other amount, and stay strings until they
 * are formatted — the browser never adds them up.
 */
const dailyTotalsSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(z.object({ date: z.string(), totalBase: z.string(), count: z.number() })),
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
export type DailyTotals = z.infer<typeof dailyTotalsSchema>;
export type DailyTotal = DailyTotals["days"][number];
export type CategorySlice = CategoryBreakdown["categories"][number];
export type TrendPoint = Trend["points"][number];

/** A window, defaulting on the server to this calendar month so far. */
/** A window, plus whether comparing it with the stretch before means anything. */
export type Window = { from: string; to: string; compare?: boolean };

export function getSummary(window?: Window): Promise<Summary> {
  if (!window) return request("/api/analytics/summary", summarySchema);
  const query = new URLSearchParams({ from: window.from, to: window.to });
  // Only sent when it is false, so an ordinary period's request is unchanged.
  if (window.compare === false) query.set("compare", "false");
  return request(`/api/analytics/summary?${query}`, summarySchema);
}

export function getCategories(window?: Window): Promise<CategoryBreakdown> {
  const query = window ? `?from=${window.from}&to=${window.to}` : "";
  return request(`/api/analytics/categories${query}`, categoryBreakdownSchema);
}

// --- receipts ----------------------------------------------------------------

/**
 * What the reader made of a photographed receipt.
 *
 * The verdict is the important half. It is a union rather than a score because
 * the interface has to *act* differently on each case, and a number would leave
 * that decision to whoever read it. See the note on ReceiptReview.
 */
const totalVerdictSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("corroborated"), total: z.number(), by: z.string() }),
  z.object({ kind: z.literal("unverified"), total: z.number(), why: z.string() }),
  z.object({
    kind: z.literal("contradicted"),
    read: z.number(),
    suggested: z.number().nullable(),
    problem: z.string(),
  }),
  z.object({ kind: z.literal("absent"), why: z.string() }),
]);

const receiptDataSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  currency: z.string(),
  vat: z.number().nullable(),
  items: z.array(z.object({ description: z.string().nullable(), amount: z.number() })),
  /** The exact text each value was read from, so the photo can be marked up. */
  sources: z.object({
    merchant: z.string().nullable(),
    date: z.string().nullable(),
    total: z.string().nullable(),
  }),
  verdict: totalVerdictSchema,
  confidence: z.number(),
});

const readReceiptResponseSchema = z.object({
  // The same promise the parse endpoint makes, asserted the same way.
  saved: z.literal(false),
  receipt: receiptDataSchema,
  // The same shape a parsed sentence produces, so the confirm step can use the
  // fields it already has rather than a second set that means the same thing.
  suggestion: suggestionSchema,
});

export type TotalVerdict = z.infer<typeof totalVerdictSchema>;
export type ReceiptData = z.infer<typeof receiptDataSchema>;
export type ReadReceiptResponse = z.infer<typeof readReceiptResponseSchema>;

/**
 * Turn the text off a receipt into a suggested expense. Saves nothing.
 *
 * Only text is sent. The photo stays in the browser — it is never uploaded,
 * never stored, and never reaches the server at all, which is what lets this
 * work on a deployment with no filesystem.
 */
export function readReceipt(lines: string[]): Promise<ReadReceiptResponse> {
  return request("/api/receipts/read", readReceiptResponseSchema, {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
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

export function getTrend(window?: { from: string; to: string }): Promise<Trend> {
  const query = window ? `?from=${window.from}&to=${window.to}` : "";
  return request(`/api/analytics/trend${query}`, trendSchema);
}

/**
 * The calendar's daily totals.
 *
 * The window is required rather than optional, unlike the pie's and the trend's.
 * Those have a sensible default because they follow the dashboard's period; this
 * one always describes a specific month the calendar is showing, and defaulting
 * it would only make it possible to ask for the wrong one by accident.
 */
export function getDailyTotals(window: { from: string; to: string }): Promise<DailyTotals> {
  return request(`/api/analytics/daily?from=${window.from}&to=${window.to}`, dailyTotalsSchema);
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
  // The window the sentence describes, so the card can say what it summarised
  // rather than assuming a month.
  from: z.string(),
  to: z.string(),
  summary: z.string(),
});

export type MonthlySummary = z.infer<typeof monthlySummarySchema>;

const askSchema = z.object({
  provider: z.string(),
  // Asking a question must not change anything, asserted the same way the parse
  // endpoint's promise is.
  saved: z.literal(false),
  answerable: z.boolean(),
  /**
   * True when the text was a purchase rather than a question. Distinct from a
   * plain refusal, because the useful reply is a signpost to the add box rather
   * than a list of what can be asked.
   */
  looksLikeExpense: z.boolean(),
  answer: z.string(),
  /** How the question was read. Null when there was nothing to run. */
  reading: z.string().nullable(),
});

export type AskAnswer = z.infer<typeof askSchema>;

/**
 * Ask a question about the expenses. Saves nothing.
 *
 * The model turns the sentence into a structured query; the backend runs it and
 * writes the sentence. No number in the reply was produced by a language model.
 */
export function askQuestion(
  question: string,
  window?: { from: string; to: string },
): Promise<AskAnswer> {
  return request("/api/ai/ask", askSchema, {
    method: "POST",
    body: JSON.stringify({ question, ...(window ?? {}) }),
  });
}

/** Ask for a written summary of a window. Saves nothing. */
export function getMonthlySummary(window?: Window): Promise<MonthlySummary> {
  return request("/api/ai/monthly-summary", monthlySummarySchema, {
    method: "POST",
    body: JSON.stringify(
      window ? { from: window.from, to: window.to, ...(window.compare === false ? { compare: false } : {}) } : {},
    ),
  });
}
