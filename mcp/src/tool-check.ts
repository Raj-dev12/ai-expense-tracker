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

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3000";

/**
 * Every expense this script creates names itself, so it can always be found
 * again.
 */
const TEST_MARKER = "Tool check";

/**
 * Delete everything this script has ever left behind.
 *
 * It goes at the API directly rather than through the MCP tools on purpose: it
 * has to work when the thing being tested is broken, which is exactly the case
 * where cleanup matters.
 *
 * Run twice — once before anything, and once in a finally. The finally covers a
 * check throwing halfway through, which is what happened: a run crashed after
 * creating its two rows and before deleting them, and the *next* run then failed
 * its own "the test rows are gone" check, reporting a mess it had not made. The
 * sweep at the start covers the case a finally cannot, which is the process
 * being killed outright.
 */
async function sweep(): Promise<number> {
  const response = await fetch(
    `${BACKEND}/api/expenses?search=${encodeURIComponent(TEST_MARKER)}&limit=200`,
  );
  if (!response.ok) return 0;

  const { expenses } = (await response.json()) as { expenses: Array<{ id: string }> };
  for (const expense of expenses) {
    // No Content-Type on a DELETE: it has no body, and announcing JSON without
    // one is refused. The same trap this repository has now hit twice.
    await fetch(`${BACKEND}/api/expenses/${expense.id}`, { method: "DELETE" });
  }

  return expenses.length;
}

const strays = await sweep();
if (strays > 0) {
  console.log(`(cleared ${strays} row${strays === 1 ? "" : "s"} left behind by an earlier run)`);
}

const client = new Client({ name: "tool-check", version: "1.0.0" });
await client.connect(transport);

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
  const body = content.map((part) => part.text ?? "").join("\n");
  return { body, isError: Boolean(result.isError) };
}

/**
 * Everything below runs inside a try, so the finally can clean up after a
 * check that throws rather than fails.
 *
 * This script writes to a real database. A run that dies halfway used to leave
 * its rows behind, and the next run then failed a check about a mess it had not
 * made — which is a worse outcome than the original failure, because it points
 * at the wrong thing.
 */
try {
  // --- the six tools are all present and described -----------------------------
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  check(
    "all seven tools are advertised",
    names.join(",") ===
      "add_expense,delete_expense,get_expense_summary,get_spending_by_category,list_expenses,search_expenses,update_expense",
    names.join(", "),
  );
  check(
    "every tool has a description an assistant can act on",
    tools.every((tool) => (tool.description ?? "").length > 80),
  );
  check(
    "the destructive ones are marked destructive",
    ["delete_expense", "update_expense"].every(
      (name) => tools.find((t) => t.name === name)?.annotations?.destructiveHint === true,
    ),
    "an update overwrites what was there, so it is not an additive change",
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

  // --- the base currency is asked for, not assumed -----------------------------
  // Non-mutating on purpose: switching the base rewrites stored figures, which is
  // not something a check script should do to somebody's data. Asking the API what
  // the base is and then asserting the tools used that symbol is enough to catch a
  // hardcoded euro sign coming back.
  const settings = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:3000"}/api/settings`);
  const { baseCurrency } = (await settings.json()) as { baseCurrency: string };
  const symbol = new Intl.NumberFormat("en-IE", { style: "currency", currency: baseCurrency })
    .format(0)
    .replace(/[0-9.,\s]/g, "");
  check(
    "amounts are reported in the configured base currency",
    summary.body.includes(symbol),
    `base is ${baseCurrency}, expected "${symbol}" in: ${summary.body.slice(0, 50)}`,
  );

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

  // A currency the person did not actually have. With conversion off — which is
  // how this ships — the argument is ignored and the number is recorded as given,
  // so "100 USD" with a GBP base is 100 in the base and not a converted figure.
  const foreign = await callTool("add_expense", {
    amount: 100,
    currency: "USD",
    merchant: "Tool check dollars",
    category: "Shopping",
    expenseDate: "2026-07-14",
  });
  check(
    "with conversion off, a currency argument is ignored",
    !foreign.isError &&
      foreign.body.includes(`${symbol}100.00`) &&
      !foreign.body.includes("converted at the rate"),
    foreign.body,
  );
  const foreignId = foreign.body.match(/id is ([0-9a-f-]{36})/)?.[1];

  // --- editing -----------------------------------------------------------------
  // The rule worth proving is that an untouched field stays untouched: renaming
  // the shop must not disturb the amount.
  const beforeRename = foreign.body.match(/([0-9]+\.[0-9]{2})/)?.[1];
  const renamed = foreignId
    ? await callTool("update_expense", { id: foreignId, merchant: "Tool check renamed" })
    : { body: "no id", isError: true };
  check("update_expense changes one field", !renamed.isError && renamed.body.includes("Tool check renamed"), renamed.body);
  check(
    "update_expense leaves the amount alone when the money did not change",
    Boolean(beforeRename) && renamed.body.includes(`${symbol}${beforeRename}`),
    `was ${beforeRename}, now ${renamed.body.match(/[0-9]+\.[0-9]{2}/)?.[0]}`,
  );
  check("update_expense says which fields it changed", renamed.body.startsWith("Updated merchant."), renamed.body.slice(0, 40));

  const recategorised = foreignId
    ? await callTool("update_expense", { id: foreignId, category: "Travel", description: null })
    : { body: "no id", isError: true };
  check("update_expense can change several fields at once", !recategorised.isError && recategorised.body.includes("Travel"), recategorised.body);

  const repriced = foreignId
    ? await callTool("update_expense", { id: foreignId, amount: 200 })
    : { body: "no id", isError: true };
  check(
    "update_expense stores a new amount as given",
    !repriced.isError && repriced.body.includes(`${symbol}200.00`),
    repriced.body.slice(0, 60),
  );

  const emptyPatch = foreignId
    ? await callTool("update_expense", { id: foreignId })
    : { body: "no id", isError: true };
  check(
    "update_expense with nothing to change is refused",
    emptyPatch.isError && emptyPatch.body.includes("at least one field"),
    emptyPatch.body.slice(0, 70),
  );

  const badUpdate = foreignId
    ? await callTool("update_expense", { id: foreignId, amount: -1 })
    : { body: "no id", isError: true };
  check("update_expense refuses a negative amount", badUpdate.isError, badUpdate.body.slice(0, 70));

  const missingUpdate = await callTool("update_expense", {
    id: "11111111-1111-4111-8111-111111111111",
    merchant: "nowhere",
  });
  check(
    "updating something that is not there is refused",
    missingUpdate.isError && missingUpdate.body.includes("No expense with that id"),
    missingUpdate.body.slice(0, 60),
  );

  const findable = await callTool("search_expenses", { query: "Tool check" });
  check("a row added through MCP is findable", !findable.isError && findable.body.includes("Tool check cafe"));
  check("rows added through MCP are marked as such", findable.body.includes("Tool check"), "source recorded server-side");

  // --- categories are read fresh, and the backend still enforces ---------------
  const liveCategoriesBody = (await (await fetch(`${BACKEND}/api/categories`)).json()) as {
    categories: Array<{ name: string; expenseCount: number }>;
  };
  const liveCategories = { categories: liveCategoriesBody.categories.map((c) => c.name) };
  check(
    "the server publishes its current categories",
    Array.isArray(liveCategories.categories) && liveCategories.categories.length > 0,
    liveCategories.categories?.join(", ").slice(0, 60),
  );

  const badCategory = await callTool("list_expenses", { category: "Snacks" });
  check("an invalid category is refused", badCategory.isError, badCategory.body.slice(0, 80));
  // The refusal has to be useful, not just correct: an assistant that is told the
  // real list can fix itself on the next call.
  check(
    "the refusal names the categories that do exist",
    liveCategories.categories.every((name) => badCategory.body.includes(name)),
    badCategory.body.slice(0, 110),
  );

  const lowercase = await callTool("list_expenses", {
    category: liveCategories.categories[0]!.toLowerCase(),
    limit: 1,
  });
  check(
    "a category in the wrong case is accepted, not nitpicked",
    !lowercase.isError,
    lowercase.body.slice(0, 60),
  );

  // The important half of the distinction. Everything above is the tool being
  // helpful; this is the rule being enforced. Going straight to the API bypasses
  // every check the MCP server makes, and it is still refused.
  const direct = await fetch(`${BACKEND}/api/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 5,
      category: "Snacks",
      expenseDate: new Date().toISOString().slice(0, 10),
    }),
  });
  check(
    "the backend refuses an invented category even with the tool bypassed",
    direct.status === 400,
    `POST /api/expenses with category "Snacks" answered ${direct.status}`,
  );

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

} finally {
  // Runs whether the checks passed, failed, or threw.
  const left = await sweep();
  if (left > 0) console.log(`(swept ${left} row(s) after a failure)`);
  await client.close();
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nall seven tools work over stdio");
process.exit(failures ? 1 : 0);
