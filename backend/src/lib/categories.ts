/**
 * The categories a fresh database starts with.
 *
 * These are *defaults*, not the list. The `categories` table is the source of
 * truth: the interface can add and remove entries, so anything asking "what can
 * an expense be filed under?" must ask the database and never this array. It is
 * used for seeding, and as the vocabulary the offline mock parser guesses from.
 *
 * It used to be a fixed list enforced by a Zod enum, and that enum was precisely
 * what made adding a category impossible. `build-plan.md` records the change.
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

/**
 * Where expenses go when the category holding them is deleted.
 *
 * A real row rather than a null or an empty string, so every chart, filter and
 * total treats it exactly like any other category and needs no special case for
 * "no category". It cannot itself be deleted — it is the floor the others stand
 * on, and removing it would leave a delete with nowhere to move things to.
 */
export const UNCATEGORISED = "Uncategorised";

/** Everything a freshly seeded database contains. */
export const SEED_CATEGORY_NAMES = [...DEFAULT_CATEGORY_NAMES, UNCATEGORISED] as const;

/**
 * Kept under the old name because the mock parser's keyword rules are typed
 * against it — and those genuinely are a fixed vocabulary. The mock can only
 * guess categories it has words for, whatever the database happens to hold.
 */
export const CATEGORY_NAMES = DEFAULT_CATEGORY_NAMES;

export type CategoryName = (typeof DEFAULT_CATEGORY_NAMES)[number];
