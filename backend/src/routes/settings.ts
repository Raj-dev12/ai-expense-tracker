import { and, count, eq, ne } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { db } from "../db/client.js";
import { expenses } from "../db/schema.js";
import { SUPPORTED_CURRENCIES } from "../fx/rates.js";
import { baseFigureFor } from "../lib/figures.js";
import { getDemoUser, setBaseCurrency } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import { updateSettingsSchema } from "../schemas/settings.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  /** What the page needs to know before it can label a single number. */
  app.get("/api/settings", async () => {
    const { baseCurrency } = await getDemoUser();
    return { baseCurrency, supportedCurrencies: SUPPORTED_CURRENCIES };
  });

  /**
   * Change the base currency every total is reported in.
   *
   * Two kinds of row are affected, and they are treated differently on purpose.
   *
   * **Rows already in the old base** — a €42 expense while the base was EUR —
   * keep their number. Switching to GBP relabels that as £42. It is not a
   * conversion and does not pretend to be one: the original amount and the base
   * figure were the same number because no conversion ever happened, and there is
   * no rate that would make £42 the "right" answer for something recorded as
   * plain 42. The interface says this in as many words next to the control,
   * because a total that changes silently is worse than one that changes and
   * explains itself.
   *
   * **Rows that were genuinely foreign** — a £30 expense carrying a euro figure
   * of 35.10 — are recomputed. Here there is a right answer: £30 in a GBP base is
   * £30, and $100 becomes whatever it was worth in pounds on the day it was
   * spent. These go back through `baseFigureFor`, the same function the create
   * and patch routes use, so there is one definition of the derived column and
   * not a second one living here.
   */
  app.patch("/api/settings", async (request) => {
    const input = validate(updateSettingsSchema, request.body, "settings");
    const { id: userId, baseCurrency: previous } = await getDemoUser();

    if (input.baseCurrency === previous) {
      return { baseCurrency: previous, previousBaseCurrency: previous, relabelled: 0, recomputed: 0 };
    }

    // Only the rows that were genuinely in another currency. Everything else was
    // recorded in the old base and keeps its number.
    const foreign = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        currency: expenses.currency,
        expenseDate: expenses.expenseDate,
      })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), ne(expenses.currency, previous)));

    await setBaseCurrency(userId, input.baseCurrency);

    /**
     * Recomputed one at a time, and deliberately not in parallel.
     *
     * Each row needs the rate for its own date, and a demo's worth of rows would
     * otherwise fire dozens of simultaneous requests at a free public rate
     * service. The cache makes the repeats cheap — expenses cluster on the same
     * handful of days — and the whole thing is a few hundred milliseconds.
     */
    let recomputed = 0;
    for (const row of foreign) {
      const amountBase = await baseFigureFor(
        row.amount,
        row.currency,
        row.expenseDate,
        input.baseCurrency,
      );

      await db.update(expenses).set({ amountBase }).where(eq(expenses.id, row.id));
      recomputed += 1;
    }

    const [totals] = await db
      .select({ total: count() })
      .from(expenses)
      .where(eq(expenses.userId, userId));

    request.log.info(
      { from: previous, to: input.baseCurrency, recomputed },
      "base currency changed",
    );

    return {
      baseCurrency: input.baseCurrency,
      previousBaseCurrency: previous,
      // Rows left exactly as they were, now read as the new currency.
      relabelled: Math.max((totals?.total ?? 0) - recomputed, 0),
      recomputed,
    };
  });
};
