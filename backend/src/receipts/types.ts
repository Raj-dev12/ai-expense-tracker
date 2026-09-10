/**
 * What a receipt turns into, once it has been read.
 *
 * This is deliberately not an expense. A receipt carries things an expense has
 * no room for — line items, a VAT figure, a verdict on whether the total can be
 * believed — and those are what make the checking possible. The mapping to an
 * expense happens afterwards, in the browser, and throws most of this away.
 */

/** One line on the receipt that looked like something bought. */
export type ReceiptItem = {
  /** What it was, if there were words beside the amount. */
  description: string | null;
  amount: number;
};

/**
 * Whether the total can be believed, and why.
 *
 * Four outcomes rather than a confidence percentage, because a percentage is a
 * number somebody has to interpret and these are decisions the interface has to
 * act on differently. The important pair is the middle two: a total nothing
 * disagrees with is *not* the same as a total something confirms, and showing
 * them identically would present "we read a number" as "we checked a number".
 *
 * `contradicted` is the one this whole module exists for. OCR reading 24,90 as
 * 2490 produces a plausible number that is completely wrong, and a plausible
 * wrong number is the thing a person scanning a screen does not catch. See
 * checks.ts for how it is caught.
 */
export type TotalVerdict =
  /** Read, and something on the receipt independently agrees with it. */
  | { kind: "corroborated"; total: number; by: string }
  /** Read, and there was nothing on the receipt to check it against. */
  | { kind: "unverified"; total: number; why: string }
  /**
   * Read, and something on the receipt disagrees.
   *
   * `suggested` is the value the disagreement points at, when the arithmetic
   * identifies one — the items summing to 24,90 says what the total should have
   * been, not merely that 2490 is wrong. Null when the checks can only say that
   * the reading is wrong, not what the right one is.
   */
  | { kind: "contradicted"; read: number; suggested: number | null; problem: string }
  /** No total found at all. */
  | { kind: "absent"; why: string };

/**
 * Where a value was read from, so the browser can draw a box round it.
 *
 * The text rather than a coordinate: the OCR ran in the browser and the word
 * boxes never left it, so the server says *what* it read and the browser finds
 * the pixels. That keeps the image, and everything positional about it, on the
 * device.
 */
export type ReceiptSources = {
  merchant: string | null;
  date: string | null;
  total: string | null;
};

export type ReceiptData = {
  merchant: string | null;
  /** ISO, or null. Never a guess — see normalize.ts. */
  date: string | null;
  /**
   * Null whenever the verdict is not `corroborated` or `unverified`.
   *
   * A contradicted total is deliberately not carried here. The value that was
   * read lives inside the verdict, where nothing can mistake it for a figure
   * ready to be saved.
   */
  total: number | null;
  currency: string;
  vat: number | null;
  items: ReceiptItem[];
  sources: ReceiptSources;
  verdict: TotalVerdict;
  /**
   * How much of the receipt was actually read, 0 to 1.
   *
   * A tally of fields found, like the mock parser's. It is *not* a measure of
   * whether the values are right — that is what the verdict is for, and
   * conflating the two is the mistake this design is arranged to avoid.
   */
  confidence: number;
};
