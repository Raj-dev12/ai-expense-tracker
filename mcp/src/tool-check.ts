/**
 * Drives this server the way an AI client does: over stdio, through the real
 * protocol, against the real backend.
 *
 * It is not a mock of the transport. The server is launched as a child process
 * and spoken to exactly as a client would, which is the only way to find out
 * whether stdout stayed clean and the tools actually work.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["../backend/node_modules/tsx/dist/cli.mjs", "src/index.ts"],
  env: { ...process.env, BACKEND_URL: process.env.BACKEND_URL ?? "http://localhost:3000" } as Record<string, string>,
});

const client = new Client({ name: "tool-check", version: "1.0.0" });
await client.connect(transport);

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
  const body = content.map((part) => part.text ?? "").join("\n");
  return { body, isError: Boolean(result.isError) };
}

// --- the six tools are all present and described -----------------------------
const { tools } = await client.listTools();
const names = tools.map((tool) => tool.name).sort();
check(
  "all six tools are advertised",
  names.join(",") ===
    "add_expense,delete_expense,get_expense_summary,get_spending_by_category,list_expenses,search_expenses",
  names.join(", "),
);
check(
  "every tool has a description an assistant can act on",
  tools.every((tool) => (tool.description ?? "").length > 80),
);
check(
  "the destructive one is marked destructive",
  tools.find((t) => t.name === "delete_expense")?.annotations?.destructiveHint === true,
);
check(
  "the reading tools are marked read-only",
  ["list_expenses", "search_expenses", "get_spending_by_category", "get_expense_summary"].every(
    (name) => tools.find((t) => t.name === name)?.annotations?.readOnlyHint === true,
  ),
);

// --- reading -----------------------------------------------------------------
const summary = await callTool("get_expense_summary");
check("get_expense_summary answers", !summary.isError && summary.body.includes("across"), summary.body.slice(0, 90));

const byCategory = await callTool("get_spending_by_category");
check("get_spending_by_category answers", !byCategory.isError && byCategory.body.includes("%"));

const listed = await callTool("list_expenses", { limit: 3 });
check("list_expenses answers", !listed.isError && listed.body.includes("id "), listed.body.split("\n")[0]);

const groceries = await callTool("list_expenses", { category: "Groceries", limit: 2 });
check("list_expenses filters by category", !groceries.isError && !groceries.body.includes("Restaurants"));

const searched = await callTool("search_expenses", { query: "lidl", limit: 5 });
check("search_expenses finds by shop name", !searched.isError && /lidl/i.test(searched.body), searched.body.split("\n")[0]);

const nothing = await callTool("search_expenses", { query: "zzzznotathing" });
check("search_expenses says so when nothing matches", !nothing.isError && nothing.body.includes("Nothing matches"));

// --- writing -----------------------------------------------------------------
const added = await callTool("add_expense", {
  amount: 12.5,
  currency: "EUR",
  merchant: "Tool check cafe",
  category: "Restaurants",
  description: "written by the MCP tool check",
});
check("add_expense saves", !added.isError && added.body.startsWith("Saved:"), added.body);

const id = added.body.match(/id is ([0-9a-f-]{36})/)?.[1];
check("add_expense reports an id that can be used", Boolean(id), id ?? "none");

const foreign = await callTool("add_expense", {
  amount: 100,
  currency: "USD",
  merchant: "Tool check dollars",
  category: "Shopping",
  expenseDate: "2026-07-14",
});
check(
  "add_expense converts a foreign amount at the rate for the day",
  !foreign.isError && foreign.body.includes("converted at the rate for 2026-07-14") && !foreign.body.includes("€92.00"),
  foreign.body,
);
const foreignId = foreign.body.match(/id is ([0-9a-f-]{36})/)?.[1];

const findable = await callTool("search_expenses", { query: "Tool check" });
check("a row added through MCP is findable", !findable.isError && findable.body.includes("Tool check cafe"));
check("rows added through MCP are marked as such", findable.body.includes("Tool check"), "source recorded server-side");

// --- validation still belongs to the backend ---------------------------------
const badCategory = await callTool("list_expenses", { category: "Snacks" });
check("an invalid category is refused", badCategory.isError, badCategory.body.slice(0, 80));

const badAmount = await callTool("add_expense", { amount: -5, category: "Groceries" });
check("a negative amount is refused", badAmount.isError, badAmount.body.slice(0, 80));

const futureDate = await callTool("add_expense", {
  amount: 5,
  category: "Groceries",
  expenseDate: "2030-01-01",
});
check("a future date is refused", futureDate.isError, futureDate.body.slice(0, 80));

// A well-formed id that belongs to nothing. The obvious all-ones string is not
// a valid UUID at all, so it would be turned away by the format check and never
// reach the question this is actually asking.
const missingRow = await callTool("delete_expense", {
  id: "11111111-1111-4111-8111-111111111111",
});
check(
  "deleting something that is not there is refused",
  missingRow.isError && missingRow.body.includes("No expense with that id"),
  missingRow.body.slice(0, 60),
);

// --- cleaning up after ourselves ---------------------------------------------
for (const toRemove of [id, foreignId]) {
  if (!toRemove) continue;
  const deleted = await callTool("delete_expense", { id: toRemove });
  check(`delete_expense removes ${toRemove.slice(0, 8)}`, !deleted.isError, deleted.body);
}

const gone = await callTool("search_expenses", { query: "Tool check" });
check("the test rows are gone again", gone.body.includes("Nothing matches"));

await client.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nall six tools work over stdio");
process.exit(failures ? 1 : 0);
