import { asc } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { categories } from "../db/schema.js";
import { CATEGORY_NAMES } from "../lib/categories.js";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  /**
   * The categories that currently exist.
   *
   * Read from the table rather than from the constant, because the table is the
   * list's home — it is where a category would appear if one were ever added.
   * Anything asking "what can I file this under?" should ask something that can
   * change, not a hardcoded array compiled into a client.
   *
   * **The table offers; the Zod enum enforces.** `createExpenseSchema` still
   * validates against `CATEGORY_NAMES`, and that is deliberate: this endpoint
   * exists to tell callers what to send, not to decide what is acceptable. A
   * caller that ignores it and invents a category is refused by the schema, the
   * same as it always was.
   *
   * The two lists agree today because the seed writes exactly `CATEGORY_NAMES`.
   * If a way to add categories is ever built, this endpoint keeps working
   * unchanged and the enum is the thing that has to become dynamic — which is
   * worth knowing before that feature is started rather than after.
   */
  app.get("/api/categories", async () => {
    const rows = await db
      .select({ name: categories.name })
      .from(categories)
      .orderBy(asc(categories.id));

    const names = rows.map((row) => row.name);

    // An empty table means nothing has been seeded yet. Falling back keeps a
    // brand new database usable rather than offering a caller no categories at
    // all, which would make every write fail for a reason nobody could see.
    return { categories: names.length > 0 ? names : [...CATEGORY_NAMES] };
  });
};
