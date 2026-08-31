import type { FastifyPluginAsync } from "fastify";
import {
  createCategory,
  listCategories,
  removeCategory,
  renameCategory,
} from "../lib/category-store.js";
import { getDemoUser } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import {
  categoryNameParamSchema,
  createCategorySchema,
  deleteCategoryQuerySchema,
  renameCategorySchema,
} from "../schemas/category.js";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  /**
   * The categories that currently exist, and how full each one is.
   *
   * Read from the table, because the table is the list now. The counts are here
   * rather than behind a second request because the only screen that needs them
   * is the one deleting a category, and it needs them before it can ask the
   * question — "this holds 14 expenses" is the whole point of the confirmation.
   */
  app.get("/api/categories", async () => {
    const { id: userId } = await getDemoUser();
    return { categories: await listCategories(userId) };
  });

  /**
   * Add a category.
   *
   * Asking for one that already exists returns it rather than failing. The
   * interface offers this from a "type a new one" box, and somebody typing a
   * name that happens to be taken has still ended up where they wanted to be.
   */
  app.post("/api/categories", async (request, reply) => {
    const input = validate(createCategorySchema, request.body, "category");
    const name = await createCategory(input.name);
    return reply.status(201).send({ name });
  });

  /**
   * Rename a category, and every expense filed under it.
   *
   * One transaction, because an expense keeps its category as text: renaming the
   * row without rewriting the expenses would leave them pointing at a name that
   * no longer exists. The response says how many were rewritten, so the
   * interface can report what actually happened rather than assuming.
   */
  app.patch("/api/categories/:name", async (request) => {
    const { name } = validate(categoryNameParamSchema, request.params, "category name");
    const input = validate(renameCategorySchema, request.body, "category");
    const { id: userId } = await getDemoUser();

    const result = await renameCategory(userId, name, input.name);

    request.log.info(result, "category renamed");
    return result;
  });

  /**
   * Remove a category, saying what to do with the expenses in it.
   *
   * `?expenses=reassign` moves them to Uncategorised; `?expenses=delete` removes
   * them with it. There is no default, because both possible guesses are bad:
   * one destroys data over a renamed label, the other quietly keeps rows
   * somebody meant to clear out.
   */
  app.delete("/api/categories/:name", async (request) => {
    const { name } = validate(categoryNameParamSchema, request.params, "category name");
    const query = validate(deleteCategoryQuerySchema, request.query, "options");
    const { id: userId } = await getDemoUser();

    const result = await removeCategory(userId, name, query.expenses);

    request.log.info(result, "category deleted");
    return result;
  });
};
