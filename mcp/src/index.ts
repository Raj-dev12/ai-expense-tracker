import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  BackendError,
  CURRENCIES,
  baseCurrency,
  call,
  currentCategories,
  categoryBreakdownSchema,
  deletedSchema,
  expenseListSchema,
  expenseSchema,
  formatExpense,
  matchCategory,
  money,
  query,
  summarySchema,
  today,
} from "./backend.js";

/**
 * An MCP server for the expense tracker.
 *
 * It speaks over stdio, which means the AI client starts this program on the
 * same machine as itself and talks to it through its input and output. That is
 * why there is no Dockerfile here and nothing in docker-compose: a container on
 * a remote server cannot be launched as a child process by somebody's laptop.
 * It runs locally and calls the deployed API over HTTPS, which demos identically
 * and removes a whole class of deployment problem.
 *
 * One consequence matters while editing this file: **stdout belongs to the
 * protocol.** A stray console.log would be read as a malformed MCP message and
 * break the connection. Anything worth saying goes to stderr.
 */

const server = new McpServer(
  { name: "expense-tracker", version: "1.0.0" },
  {
    instructions:
      "Tools for a personal expense tracker. Reading tools can be used freely to answer " +
      "questions about spending. add_expense, update_expense and delete_expense change " +
      "stored data and should only be used when the person has actually asked for that.",
  },
);

/** Turn any failure into something the assistant can read and act on. */
function fail(error: unknown) {
  const message =
    error instanceof BackendError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

/**
 * Turn a category an assistant guessed into one that exists, or explain.
 *
 * The list is read fresh on every call, like the base currency, so a category
 * added a minute ago is usable immediately and one that has gone is not offered.
 *
 * This guides; it does not enforce. The backend rejects an unknown category
 * whatever happens here — that check is the one that matters, and it is the one
 * that cannot be talked around. What this adds is a *useful* failure: an
 * assistant told "Snacks is not a category, the current ones are Groceries,
 * Restaurants, ..." can correct itself on the next call, where a bare 400 leaves
 * it guessing again.
 */
async function resolveCategory(given: string): Promise<{ name: string } | { error: string }> {
  const available = await currentCategories();
  const matched = matchCategory(given, available);

  if (!matched) {
    return {
      error:
        `"${given}" is not one of the categories. ` +
        `The current ones are: ${available.join(", ")}.`,
    };
  }

  return { name: matched };
}

const isoDate = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Write the date as YYYY-MM-DD");

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

server.registerTool(
  "add_expense",
  {
    title: "Add an expense",
    description:
      "Record a new expense. Use this when the person says they spent money on something and " +
      "wants it kept. The amount and the category are required; everything else is optional. " +
      "Currency conversion is off by default on this server, and with it off the currency " +
      "argument is ignored: the amount is recorded as given, in whatever currency the person " +
      "has set as their base. Send the number they said and do not convert anything yourself. " +
      "Work out the date before calling: if they say 'yesterday', send " +
      "yesterday's date as YYYY-MM-DD. Leave the date out only if it happened today. This " +
      "writes to their records, so do not call it to answer a question.",
    inputSchema: {
      amount: z.number().positive().describe("How much was spent, in the currency it was spent in"),
      category: z
        .string()
        .describe(
          "The single category that fits best. Call this tool with any value to be told " +
            "the current list if you are unsure — the categories are read fresh from the " +
            "server on every call rather than fixed in this description",
        ),
      currency: z
        .enum(CURRENCIES)
        .optional()
        .describe("Three-letter code. Ignored unless the server has conversion switched on"),
      merchant: z.string().max(120).optional().describe("The shop or company, if one was named"),
      description: z.string().max(500).optional().describe("A short note about what it was for"),
      expenseDate: isoDate.optional().describe("The day it was spent. Defaults to today"),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (args) => {
    try {
      const category = await resolveCategory(args.category);
      if ("error" in category) return fail(new BackendError(category.error));

      const base = await baseCurrency();
      const saved = await call("/api/expenses", expenseSchema, {
        method: "POST",
        body: JSON.stringify({
          amount: args.amount,
          currency: args.currency ?? "EUR",
          merchant: args.merchant ?? null,
          category: category.name,
          description: args.description ?? null,
          expenseDate: args.expenseDate ?? today(),
          // Recorded so the person can see which rows an assistant created.
          source: "mcp",
        }),
      });

      const converted =
        saved.currency === base
          ? ""
          : ` (${saved.amount} ${saved.currency} converted at the rate for ${saved.expenseDate})`;

      return text(`Saved: ${money(saved.amountBase, base)}${converted} at ${saved.merchant ?? "an unnamed place"} on ${saved.expenseDate}, filed under ${saved.category}. Its id is ${saved.id}.`);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "update_expense",
  {
    title: "Change an expense",
    description:
      "Change one or more fields of an expense that already exists. Ids come from " +
      "list_expenses or search_expenses — never invent one, and never guess which row was " +
      "meant; if more than one could match, show them and ask which. Send only the fields " +
      "being changed: anything left out keeps its current value, so to correct a shop name " +
      "you send the id and the merchant and nothing else. Send merchant or description as " +
      "null to empty them. Currency conversion is off by default, and with it off the amount " +
      "is stored exactly as given. This overwrites stored data and " +
      "cannot be undone, so only use it when the person has asked for a change.",
    inputSchema: {
      id: z.string().describe("The id of the expense to change, taken from a listing"),
      amount: z
        .number()
        .positive()
        .optional()
        .describe("A corrected amount, in the currency it was spent in"),
      currency: z
        .enum(CURRENCIES)
        .optional()
        .describe("A corrected code. Ignored unless the server has conversion switched on"),
      merchant: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .describe("A corrected shop or company. Pass null to clear it"),
      category: z.string().optional().describe("A corrected category, from the current list"),
      description: z
        .string()
        .max(500)
        .nullable()
        .optional()
        .describe("A corrected note. Pass null to clear it"),
      expenseDate: isoDate.optional().describe("A corrected date, as YYYY-MM-DD"),
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const { id, ...changes } = args;

      // Only the keys the assistant actually sent are forwarded. Filling in the
      // rest from a previous read would turn every edit into a full overwrite,
      // and would re-convert the currency on an edit that never touched it.
      const patch = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      );

      // Checked against the live list only when the edit actually names one, so
      // correcting a shop name costs no extra request.
      if (typeof patch.category === "string") {
        const category = await resolveCategory(patch.category);
        if ("error" in category) return fail(new BackendError(category.error));
        patch.category = category.name;
      }

      const base = await baseCurrency();
      const updated = await call(`/api/expenses/${id}`, expenseSchema, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      const fields = Object.keys(patch).join(", ");
      const converted =
        updated.currency === base
          ? ""
          : ` (${updated.amount} ${updated.currency} converted at the rate for ${updated.expenseDate})`;

      return text(
        `Updated ${fields}. It is now ${money(updated.amountBase, base)}${converted} at ${updated.merchant ?? "an unnamed place"} on ${updated.expenseDate}, filed under ${updated.category}.`,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "delete_expense",
  {
    title: "Delete an expense",
    description:
      "Permanently delete one expense by its id. Ids come from list_expenses or " +
      "search_expenses — never invent one, and never guess which row was meant. This cannot be " +
      "undone, so unless the person has clearly said to delete a specific expense, show them " +
      "what you found and ask which one first.",
    inputSchema: {
      id: z.string().describe("The id of the expense to delete, taken from a listing"),
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const base = await baseCurrency();
      const { deleted } = await call(`/api/expenses/${args.id}`, deletedSchema, {
        method: "DELETE",
      });
      return text(
        `Deleted ${money(deleted.amountBase, base)} at ${deleted.merchant ?? "an unnamed place"} on ${deleted.expenseDate}.`,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

server.registerTool(
  "list_expenses",
  {
    title: "List expenses",
    description:
      "List recorded expenses, newest first. Use this for questions about what was spent over " +
      "a period — 'what did I spend last week', 'show me my recent expenses', 'what did I buy " +
      "in July'. Every filter is optional; with none, it returns the most recent ones. Use " +
      "search_expenses instead when the person names a particular shop or thing.",
    inputSchema: {
      from: isoDate.optional().describe("Only expenses on or after this day"),
      to: isoDate.optional().describe("Only expenses on or before this day"),
      category: z.string().optional().describe("Only this category, from the current list"),
      minAmount: z
        .number()
        .nonnegative()
        .optional()
        .describe("Only amounts at or above this, in the base currency"),
      limit: z.number().int().min(1).max(200).optional().describe("How many to return. Defaults to 20"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      // A filter naming a category that does not exist would quietly return
      // nothing, which reads as "you spent nothing on that" rather than "there
      // is no such category". Checking first turns a silent wrong answer into a
      // useful one.
      let category = args.category;
      if (category !== undefined) {
        const resolved = await resolveCategory(category);
        if ("error" in resolved) return fail(new BackendError(resolved.error));
        category = resolved.name;
      }

      const result = await call(
        `/api/expenses${query({
          from: args.from,
          to: args.to,
          category,
          minAmount: args.minAmount,
          limit: args.limit ?? 20,
        })}`,
        expenseListSchema,
      );

      if (result.expenses.length === 0) return text("No expenses match that.");

      const base = await baseCurrency();
      const total = result.expenses.reduce((sum, e) => sum + Number(e.amountBase), 0);
      return text(
        `${result.expenses.length} of ${result.total} matching expenses, ${money(total, base)} in total:\n\n` +
          result.expenses.map((expense) => formatExpense(expense, base)).join("\n"),
      );
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "search_expenses",
  {
    title: "Search expenses",
    description:
      "Find expenses by text, matched against the shop name and the note. Use this when the " +
      "person names a place or a thing rather than a category — 'how much have I spent at " +
      "Lidl', 'find that train ticket', 'what did the dentist cost'. Can be narrowed by date. " +
      "For a whole category or a plain date range, list_expenses is the better fit.",
    inputSchema: {
      query: z.string().min(1).max(100).describe("Text to look for in the shop name or the note"),
      from: isoDate.optional().describe("Only expenses on or after this day"),
      to: isoDate.optional().describe("Only expenses on or before this day"),
      limit: z.number().int().min(1).max(200).optional().describe("How many to return. Defaults to 20"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const result = await call(
        `/api/expenses${query({
          search: args.query,
          from: args.from,
          to: args.to,
          limit: args.limit ?? 20,
        })}`,
        expenseListSchema,
      );

      if (result.expenses.length === 0) {
        return text(`Nothing matches "${args.query}".`);
      }

      const base = await baseCurrency();
      const total = result.expenses.reduce((sum, e) => sum + Number(e.amountBase), 0);
      return text(
        `${result.expenses.length} of ${result.total} expenses matching "${args.query}", ${money(total, base)} in total:\n\n` +
          result.expenses.map((expense) => formatExpense(expense, base)).join("\n"),
      );
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "get_spending_by_category",
  {
    title: "Spending by category",
    description:
      "Total spending broken down by category, largest first. Use this for 'what do I spend " +
      "most on', 'how much went on groceries', or any question about the shape of their " +
      "spending rather than individual purchases. Covers the current month unless given dates.",
    inputSchema: {
      from: isoDate.optional().describe("Start of the period. Defaults to the first of this month"),
      to: isoDate.optional().describe("End of the period. Defaults to today"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const result = await call(
        `/api/analytics/categories${query({ from: args.from, to: args.to })}`,
        categoryBreakdownSchema,
      );

      if (result.categories.length === 0) {
        return text(`Nothing recorded between ${result.from} and ${result.to}.`);
      }

      const base = await baseCurrency();
      const total = result.categories.reduce((sum, c) => sum + Number(c.totalBase), 0);
      const lines = result.categories.map((c) => {
        const share = total > 0 ? Math.round((Number(c.totalBase) / total) * 100) : 0;
        return `${c.category}: ${money(c.totalBase, base)} (${share}%, ${c.count} ${c.count === 1 ? "expense" : "expenses"})`;
      });

      return text(
        `Spending from ${result.from} to ${result.to}, ${money(total, base)} in total:\n\n${lines.join("\n")}`,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "get_expense_summary",
  {
    title: "This month so far",
    description:
      "How this month is going: total spent, how many expenses, the daily average, and how it " +
      "compares with the same number of days last month. Use this for 'how am I doing this " +
      "month', 'am I spending more than usual', or as a starting point before digging into " +
      "detail. Takes no arguments and always describes the current month.",
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      const base = await baseCurrency();
      const summary = await call("/api/analytics/summary", summarySchema);

      const comparison =
        summary.changePercent === null
          ? "There is nothing recorded for the same days last month to compare against."
          : `That is ${Math.abs(summary.changePercent)}% ${summary.changePercent >= 0 ? "more" : "less"} than the same ${summary.daysElapsed} days last month (${money(summary.previous.totalBase, base)}).`;

      return text(
        `${money(summary.totalBase, base)} across ${summary.count} expenses in the ${summary.daysElapsed} days ` +
          `from ${summary.from} to ${summary.to}, averaging ${money(summary.dailyAverageBase, base)} a day. ${comparison}`,
      );
    } catch (error) {
      return fail(error);
    }
  },
);

// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

// stderr, never stdout — stdout is the protocol.
console.error("Expense tracker MCP server ready on stdio");
