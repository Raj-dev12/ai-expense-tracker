import assert from "node:assert/strict";
import test from "node:test";
import { listExpensesQuerySchema } from "./expense.js";

/**
 * The expense filters, and in particular the one that became a list.
 *
 * The pie folds its smallest categories into a single slice. Clicking that
 * slice has to ask for exactly the set it drew — asking for the literal name
 * "Other" returned the one real category of that name, so a tooltip describing
 * five categories sat above a panel listing one.
 */

test("one category still works, and arrives as a list", () => {
  const parsed = listExpensesQuerySchema.parse({ category: "Groceries" });
  assert.deepEqual(parsed.category, ["Groceries"]);
});

test("several categories, the way a repeated query key arrives", () => {
  const parsed = listExpensesQuerySchema.parse({
    category: ["Other", "Health", "Restaurants", "Transport", "Entertainment"],
  });
  assert.deepEqual(parsed.category, [
    "Other",
    "Health",
    "Restaurants",
    "Transport",
    "Entertainment",
  ]);
});

test("no category at all is still allowed", () => {
  assert.equal(listExpensesQuerySchema.parse({}).category, undefined);
});

test("an empty list is refused rather than read as no filter", () => {
  // Silently treating it as "everything" would be the same class of bug the
  // list exists to fix: a filter that quietly stops filtering.
  assert.equal(listExpensesQuerySchema.safeParse({ category: [] }).success, false);
});

test("a blank name in the list is refused", () => {
  assert.equal(
    listExpensesQuerySchema.safeParse({ category: ["Groceries", "  "] }).success,
    false,
  );
});

test("unknown filters are still rejected outright", () => {
  // ?form= instead of ?from= is a typo that would otherwise answer a different
  // question and look fine doing it.
  assert.equal(listExpensesQuerySchema.safeParse({ form: "2026-08-01" }).success, false);
});
