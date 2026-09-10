import { z } from "zod";
import { isoDateSchema } from "./expense.js";

/**
 * The body of POST /api/receipts/read.
 *
 * Lines of text, not an image. The OCR ran in the browser and the photo stays
 * there — this endpoint never sees it, nothing is written to disk, and there is
 * no upload to size-limit or store. That is what makes the whole feature
 * possible on a serverless deployment with no filesystem, and it is also why the
 * original objection to receipt photos — "needs file uploads and image storage"
 * — no longer applies.
 *
 * The caps are here because a request body is an input like any other. A receipt
 * is forty lines of forty characters; anything approaching these limits is not a
 * receipt.
 */
export const readReceiptRequestSchema = z.strictObject({
  lines: z.array(z.string().max(200)).min(1, "There was no text to read").max(400),
  // Optional, so a test can pin what "the most recent 4 September" means. Left
  // out in normal use, where the server decides what today is.
  today: isoDateSchema.optional(),
});

const receiptItemSchema = z.strictObject({
  description: z.string().nullable(),
  amount: z.number(),
});

/**
 * The verdict, as a discriminated union.
 *
 * Zod is doing real work here rather than restating the type: it is what stops a
 * `contradicted` verdict ever arriving with a `total` field on it. The whole
 * design rests on a contradicted reading being structurally unable to look like
 * a usable figure, and a shape that cannot express one is a stronger guarantee
 * than a rule saying it should not.
 */
const totalVerdictSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("corroborated"), total: z.number(), by: z.string() }),
  z.strictObject({ kind: z.literal("unverified"), total: z.number(), why: z.string() }),
  z.strictObject({
    kind: z.literal("contradicted"),
    read: z.number(),
    suggested: z.number().nullable(),
    problem: z.string(),
  }),
  z.strictObject({ kind: z.literal("absent"), why: z.string() }),
]);

export const receiptDataSchema = z.strictObject({
  merchant: z.string().nullable(),
  date: isoDateSchema.nullable(),
  total: z.number().positive().max(1_000_000).nullable(),
  currency: z.string(),
  vat: z.number().nullable(),
  items: z.array(receiptItemSchema),
  sources: z.strictObject({
    merchant: z.string().nullable(),
    date: z.string().nullable(),
    total: z.string().nullable(),
  }),
  verdict: totalVerdictSchema,
  confidence: z.number().min(0).max(1),
});

export type ReadReceiptRequest = z.infer<typeof readReceiptRequestSchema>;
