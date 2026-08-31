import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories, expenses } from "../db/schema.js";
import { SEED_CATEGORY_NAMES, UNCATEGORISED } from "./categories.js";
import { HttpError } from "./http-error.js";

/**
 * Everything that knows what a category is.
 *
 * The `categories` table is the source of truth now, not a constant, so this
 * module is what every other part of the app asks. Validation used to be a Zod
 * enum built from a hardcoded array — which is exactly why a new category could
 * never be used — and the check lives here instead.
 */

export type CategoryWithCount = { name: string; expenseCount: number };

/** Every category, in the order they were created, with how many expenses each holds. */
export async function listCategories(userId: string): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      name: categories.name,
      // A left join would need a group by over a text column that is not a
      // foreign key. Counting in a correlated subquery keeps categories with no
      // expenses in the list, which matters — a category you just made has none
      // and must still appear.
      expenseCount: sql<number>`(
        select count(*) from ${expenses}
        where ${expenses.category} = ${categories.name}
          and ${expenses.userId} = ${userId}
      )::int`,
    })
    .from(categories)
    .orderBy(asc(categories.id));

  return rows;
}

export async function categoryNames(): Promise<string[]> {
  const rows = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.id));
  return rows.map((row) => row.name);
}

/**
 * Check a category exists, and return it spelled the way the table spells it.
 *
 * The replacement for the Zod enum. It is a database read rather than a shape
 * check, which is why it happens in the route instead of inside the schema:
 * `validate()` is synchronous on purpose, and threading a connection into schema
 * parsing would put a query somewhere nobody expects one.
 *
 * The 400 it throws carries the same shape a Zod failure would, so a caller
 * cannot tell which kind of check refused it — and does not need to.
 */
export async function resolveCategory(given: string): Promise<string> {
  const trimmed = given.trim();

  const [row] = await db
    .select({ name: categories.name })
    .from(categories)
    // Case-insensitive: "groceries" is obviously the same choice as "Groceries",
    // and the stored spelling is what comes back so the column stays consistent.
    .where(sql`lower(${categories.name}) = lower(${trimmed})`)
    .limit(1);

  if (!row) {
    throw new HttpError(400, "Invalid category", [
      { field: "category", message: `No category called "${trimmed}"` },
    ]);
  }

  return row.name;
}

/** Add one. Returns the stored name, which may differ in case from what was sent. */
export async function createCategory(name: string): Promise<string> {
  const trimmed = name.trim();

  const [existing] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${trimmed})`)
    .limit(1);

  // Not an error. Asking for a category that already exists got you what you
  // asked for, and the interface's "type a new one" box should not punish
  // somebody for typing a name that happens to be taken.
  if (existing) return existing.name;

  const [created] = await db
    .insert(categories)
    .values({ name: trimmed })
    .onConflictDoNothing()
    .returning({ name: categories.name });

  if (created) return created.name;

  // Another request inserted it between the check and the insert.
  const [raced] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${trimmed})`)
    .limit(1);

  if (!raced) throw new HttpError(500, "The category could not be created");
  return raced.name;
}

export type CategoryRename = { from: string; to: string; expensesUpdated: number };

/**
 * Rename a category, and every expense filed under it.
 *
 * An expense stores its category as text rather than as a foreign key — a
 * decision from hour 1, made because the Zod enum already rejected anything
 * outside the list and a foreign key would have been a second lock on the same
 * door. The trade comes due here: there is no cascade, so the rename has to
 * rewrite the rows itself.
 *
 * **Both writes are one transaction.** Half of this is worse than none of it: a
 * renamed row with the expenses still holding the old text would leave every one
 * of them pointing at a category that no longer exists, invisible to the filter
 * and uneditable without knowing what happened. Either both land or neither
 * does.
 */
export async function renameCategory(
  userId: string,
  from: string,
  to: string,
): Promise<CategoryRename> {
  const current = await resolveCategory(from);
  const next = to.trim();

  if (current === UNCATEGORISED) {
    throw new HttpError(400, "Uncategorised cannot be renamed", [
      {
        field: "name",
        message: "Expenses are moved here by name when their category is deleted.",
      },
    ]);
  }

  // Changing only the capitalisation is a rename of the same row, not a clash
  // with itself.
  if (current.toLowerCase() !== next.toLowerCase()) {
    const [clash] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(sql`lower(${categories.name}) = lower(${next})`)
      .limit(1);

    if (clash) {
      throw new HttpError(400, "That name is taken", [
        {
          field: "name",
          // Merging two categories is a different feature with its own
          // questions, so this refuses rather than guessing at one.
          message: `A category called "${clash.name}" already exists.`,
        },
      ]);
    }
  }

  if (current === next) return { from: current, to: next, expensesUpdated: 0 };

  return db.transaction(async (tx) => {
    await tx.update(categories).set({ name: next }).where(eq(categories.name, current));

    const moved = await tx
      .update(expenses)
      .set({ category: next })
      .where(and(eq(expenses.userId, userId), eq(expenses.category, current)))
      .returning({ id: expenses.id });

    return { from: current, to: next, expensesUpdated: moved.length };
  });
}

export type DeleteMode = "reassign" | "delete";

export type CategoryDeletion = {
  category: string;
  /** How many expenses were in it. */
  expenseCount: number;
  mode: DeleteMode;
  /** Moved to Uncategorised, or removed outright. */
  reassigned: number;
  deleted: number;
};

/**
 * Remove a category, and say what happened to the expenses that were in it.
 *
 * The caller has to choose: move them to Uncategorised, or delete them too.
 * There is deliberately no default. Silently deleting somebody's expenses
 * because they removed a label would be the worst possible reading of the
 * request, and silently reassigning them would surprise anyone who meant the
 * other thing.
 */
export async function removeCategory(
  userId: string,
  name: string,
  mode: DeleteMode,
): Promise<CategoryDeletion> {
  const canonical = await resolveCategory(name);

  if (canonical === UNCATEGORISED) {
    throw new HttpError(400, "Uncategorised cannot be deleted", [
      {
        field: "category",
        message: "It is where expenses go when their category is removed.",
      },
    ]);
  }

  const [totals] = await db
    .select({ total: count() })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.category, canonical)));

  const expenseCount = totals?.total ?? 0;
  let reassigned = 0;
  let deleted = 0;

  if (expenseCount > 0) {
    if (mode === "reassign") {
      // Uncategorised has to exist for this to land anywhere. It is seeded, and
      // created here if an older database never had it.
      await ensureUncategorised();
      const moved = await db
        .update(expenses)
        .set({ category: UNCATEGORISED })
        .where(and(eq(expenses.userId, userId), eq(expenses.category, canonical)))
        .returning({ id: expenses.id });
      reassigned = moved.length;
    } else {
      const removed = await db
        .delete(expenses)
        .where(and(eq(expenses.userId, userId), eq(expenses.category, canonical)))
        .returning({ id: expenses.id });
      deleted = removed.length;
    }
  }

  await db.delete(categories).where(eq(categories.name, canonical));

  return { category: canonical, expenseCount, mode, reassigned, deleted };
}

export async function ensureUncategorised(): Promise<void> {
  await db.insert(categories).values({ name: UNCATEGORISED }).onConflictDoNothing();
}

/** Used by the seed, and to repair a database that predates a default. */
export async function ensureSeedCategories(): Promise<void> {
  await db
    .insert(categories)
    .values(SEED_CATEGORY_NAMES.map((name) => ({ name })))
    .onConflictDoNothing();
}
