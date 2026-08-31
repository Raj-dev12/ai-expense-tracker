import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  BackendError,
  CATEGORY_NAMES,
  CURRENCIES,
  call,
  categoryBreakdownSchema,
  deletedSchema,
  expenseListSchema,
  expenseSchema,
  formatExpense,
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
      "Amounts in other currencies are converted to euros automatically, using the exchange " +
      "rate from the day it was spent, so pass the amount exactly as it was spent rather than " +
      "converting it yourself. Work out the date before calling: if they say 'yesterday', send " +
      "yesterday's date as YYYY-MM-DD. Leave the date out only if it happened today. This " +
      "writes to their records, so do not call it to answer a question.",
    inputSchema: {
      amount: z.number().positive().describe("How much was spent, in the currency it was spent in"),
      category: z.enum(CATEGORY_NAMES).describe("The single category that fits best"),
      currency: z
        .enum(CURRENCIES)
        .optional()
        .describe("Three-letter code. Defaults to EUR when the person did not say"),
      merchant: z.string().max(120).optional().describe("The shop or company, if one was named"),
      description: z.string().max(500).optional().describe("A short note about what it was for"),
      expenseDate: isoDate.optional().describe("The day it was spent. Defaults to today"),
    },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (args) => {
    try {
      const saved = await call("/api/expenses", expenseSchema, {
        method: "POST",
        body: JSON.stringify({
          amount: args.amount,
          currency: args.currency ?? "EUR",
          merchant: args.merchant ?? null,
          category: args.category,
          description: args.description ?? null,
          expenseDate: args.expenseDate ?? today(),
          // Recorded so the person can see which rows an assistant created.
          source: "mcp",
        }),
      });

      const converted =
        saved.currency === "EUR"
          ? ""
          : ` (${saved.amount} ${saved.currency} converted at the rate for ${saved.expenseDate})`;

      return text(`Saved: €${saved.amountEur}${converted} at ${saved.merchant ?? "an unnamed place"} on ${saved.expenseDate}, filed under ${saved.category}. Its id is ${saved.id}.`);
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
      "null to empty them. Changing the amount, the currency or the date re-converts the euro " +
      "figure automatically using the rate for the day it was spent, so pass the amount as it " +
      "was actually spent rather than converting it yourself. This overwrites stored data and " +
      "cannot be undone, so only use it when the person has asked for a change.",
    inputSchema: {
      id: z.string().describe("The id of the expense to change, taken from a listing"),
      amount: z
        .number()
        .positive()
        .optional()
        .describe("A corrected amount, in the currency it was spent in"),
      currency: z.enum(CURRENCIES).optional().describe("A corrected three-letter code"),
      merchant: z
        .string()
        .max(120)
        .nullable()
        .optional()
        .describe("A corrected shop or company. Pass null to clear it"),
      category: z.enum(CATEGORY_NAMES).optional().describe("A corrected category"),
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

      const updated = await call(`/api/expenses/${id}`, expenseSchema, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      const fields = Object.keys(patch).join(", ");
      const converted =
        updated.currency === "EUR"
          ? ""
          : ` (${updated.amount} ${updated.currency} converted at the rate for ${updated.expenseDate})`;

      return text(
        `Updated ${fields}. It is now €${updated.amountEur}${converted} at ${updated.merchant ?? "an unnamed place"} on ${updated.expenseDate}, filed under ${updated.category}.`,
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
      const { deleted } = await call(`/api/expenses/${args.id}`, deletedSchema, {
        method: "DELETE",
      });
      return text(
        `Deleted €${deleted.amountEur} at ${deleted.merchant ?? "an unnamed place"} on ${deleted.expenseDate}.`,
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
      category: z.enum(CATEGORY_NAMES).optional().describe("Only this category"),
      minAmount: z.number().nonnegative().optional().describe("Only amounts at or above this, in euros"),
      limit: z.number().int().min(1).max(200).optional().describe("How many to return. Defaults to 20"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      const result = await call(
        `/api/expenses${query({
          from: args.from,
          to: args.to,
          category: args.category,
          minAmount: args.minAmount,
          limit: args.limit ?? 20,
        })}`,
        expenseListSchema,
      );

      if (result.expenses.length === 0) return text("No expenses match that.");

      const total = result.expenses.reduce((sum, e) => sum + Number(e.amountEur), 0);
      return text(
        `${result.expenses.length} of ${result.total} matching expenses, €${total.toFixed(2)} in total:\n\n` +
          result.expenses.map(formatExpense).join("\n"),
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

      const total = result.expenses.reduce((sum, e) => sum + Number(e.amountEur), 0);
      return text(
        `${result.expenses.length} of ${result.total} expenses matching "${args.query}", €${total.toFixed(2)} in total:\n\n` +
          result.expenses.map(formatExpense).join("\n"),
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

      const total = result.categories.reduce((sum, c) => sum + Number(c.totalEur), 0);
      const lines = result.categories.map((c) => {
        const share = total > 0 ? Math.round((Number(c.totalEur) / total) * 100) : 0;
        return `${c.category}: €${c.totalEur} (${share}%, ${c.count} ${c.count === 1 ? "expense" : "expenses"})`;
      });

      return text(
        `Spending from ${result.from} to ${result.to}, €${total.toFixed(2)} in total:\n\n${lines.join("\n")}`,
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
      const summary = await call("/api/analytics/summary", summarySchema);

      const comparison =
        summary.changePercent === null
          ? "There is nothing recorded for the same days last month to compare against."
          : `That is ${Math.abs(summary.changePercent)}% ${summary.changePercent >= 0 ? "more" : "less"} than the same ${summary.daysElapsed} days last month (€${summary.previous.totalEur}).`;

      return text(
        `€${summary.totalEur} across ${summary.count} expenses in the ${summary.daysElapsed} days ` +
          `from ${summary.from} to ${summary.to}, averaging €${summary.dailyAverageEur} a day. ${comparison}`,
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
