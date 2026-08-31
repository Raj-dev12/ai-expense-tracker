import { z } from "zod";
import { isoDateSchema } from "./expense.js";

/**
 * The summary takes a window, and defaults to this calendar month so far.
 *
 * It used to take no parameters at all, because it only ever answered about the
 * current month. The period dropdown needs it to answer about a week, a quarter
 * or a year, and every one of those is a `from` and a `to` — the same pair the
 * pie and the trend already take, so nothing new had to be invented.
 *
 * Still strict, so a typo like `?form=2026-08-01` is answered with a clear error
 * rather than silently ignored, which is the failure mode that has people
 * staring at a chart wondering why the filter did nothing.
 */
export const summaryQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** Both the pie and the trend accept an explicit window, and have a sensible default. */
export const rangeQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
