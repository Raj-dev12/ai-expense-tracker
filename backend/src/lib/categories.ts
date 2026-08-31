// The fixed list of categories, defined once and imported everywhere: the Zod
// validator, the seed script and (later) the frontend dropdown all read from
// here, so the list can never drift out of step with itself.
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

export type CategoryName = (typeof CATEGORY_NAMES)[number];
