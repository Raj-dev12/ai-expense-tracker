import { z } from "zod";
import { currencySchema } from "./expense.js";

/**
 * The body of PATCH /api/settings.
 *
 * `currencySchema` is the same one an expense uses, so the list of currencies a
 * person can report totals in and the list they can spend in cannot drift apart.
 */
export const updateSettingsSchema = z.strictObject({
  baseCurrency: currencySchema,
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
