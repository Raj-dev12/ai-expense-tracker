import { z } from "zod";
import { isoDateSchema } from "./expense.js";

/**
 * The summary is always month-to-date, so it takes no parameters at all.
 *
 * A strict object with no keys is not pedantry: it means a typo like
 * `?form=2026-08-01` is answered with a clear error rather than silently
 * ignored, which is the failure mode that has people staring at a chart
 * wondering why the filter did nothing.
 */
export const summaryQuerySchema = z.strictObject({});

/** Both the pie and the trend accept an explicit window, and have a sensible default. */
export const rangeQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
