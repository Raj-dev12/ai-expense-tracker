import { z } from "zod";

/**
 * The body of POST /api/categories.
 *
 * Deliberately permissive about content and strict about size. A category is a
 * label somebody types for themselves; refusing punctuation or accents would be
 * inventing a rule for no reason. The length cap matches the column.
 */
export const createCategorySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Give the category a name")
    .max(40, "Category names are at most 40 characters"),
});

/**
 * The body of PATCH /api/categories/:name.
 *
 * The same rules as creating one, because a rename produces a category that has
 * to be as valid as a new one.
 */
export const renameCategorySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "Give the category a name")
    .max(40, "Category names are at most 40 characters"),
});

/**
 * What to do with the expenses inside a category being deleted.
 *
 * Required, with no default. Guessing either way is wrong: assuming "delete"
 * would destroy expenses because somebody tidied a label, and assuming
 * "reassign" would surprise anyone who meant to clear the lot.
 */
export const deleteCategoryQuerySchema = z.strictObject({
  expenses: z.enum(["reassign", "delete"], {
    message: 'Say what to do with its expenses: "reassign" or "delete"',
  }),
});

export const categoryNameParamSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
});
