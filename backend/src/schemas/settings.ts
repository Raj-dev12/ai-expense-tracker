import { z } from "zod";
import { ISO_CURRENCIES } from "../fx/rates.js";

/**
 * The body of PATCH /api/settings.
 *
 * Validated against the full ISO 4217 list rather than the dozen the rate table
 * covers. With conversion off the base is a label — it decides which symbol sits
 * in front of a number and nothing else — so restricting it to currencies we can
 * convert would be enforcing a rule that no longer applies.
 */
export const updateSettingsSchema = z.strictObject({
  baseCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => ISO_CURRENCIES.includes(value), {
      message: "Not a currency code ISO 4217 recognises",
    }),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
