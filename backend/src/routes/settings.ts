import type { FastifyPluginAsync } from "fastify";
import { CONVERTIBLE_CURRENCIES, ISO_CURRENCIES, isConversionEnabled } from "../fx/rates.js";
import { getDemoUser, setBaseCurrency } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import { updateSettingsSchema } from "../schemas/settings.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * What the page needs before it can label a single number, or decide whether
   * to ask the question in the first place.
   */
  app.get("/api/settings", async () => {
    const { baseCurrency, baseCurrencyChosen } = await getDemoUser();

    return {
      baseCurrency,
      // False on a fresh database and after every re-seed. The page asks before
      // letting anything be entered, because the seeded amounts are plain
      // numbers and what they are numbers *of* is worth establishing first.
      baseCurrencyChosen,
      conversionEnabled: isConversionEnabled(),
      currencies: ISO_CURRENCIES,
      // Only meaningful when conversion is on; sent anyway so the page never has
      // to guess which currencies could be converted.
      convertibleCurrencies: CONVERTIBLE_CURRENCIES,
    };
  });

  /**
   * Change the currency every total is reported in.
   *
   * **This rewrites nothing.** It sets one column on one row. Every stored
   * figure stays exactly as it was, so switching to GBP and back to EUR leaves
   * the database byte for byte where it started.
   *
   * That is a deliberate reversal of how this worked when it was first built.
   * The original version recomputed foreign rows and relabelled the rest, which
   * was defensible but made a round trip lossy: a row in the old base kept its
   * number both ways, so its original conversion was gone for good. Making the
   * base a pure label costs nothing while conversion is off — there is only one
   * currency to be in — and buys back the property that matters more, which is
   * that changing your mind is free.
   */
  app.patch("/api/settings", async (request) => {
    const input = validate(updateSettingsSchema, request.body, "settings");
    const { id: userId, baseCurrency: previous } = await getDemoUser();

    await setBaseCurrency(userId, input.baseCurrency);

    request.log.info(
      { from: previous, to: input.baseCurrency },
      "base currency changed — no stored figure was touched",
    );

    return {
      baseCurrency: input.baseCurrency,
      previousBaseCurrency: previous,
      baseCurrencyChosen: true,
    };
  });
};
