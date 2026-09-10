import type { MoneyToken } from "./normalize.js";
import type { TotalVerdict } from "./types.js";

/**
 * Deciding whether the total can be believed.
 *
 * WHY THE OCR ENGINE'S OWN CONFIDENCE IS NOT ENOUGH
 * -------------------------------------------------
 * Tesseract reports how sure it is about each word, and that number is about
 * *pixels* — how cleanly the shape it saw matches the glyph it chose. A crisp
 * photo where an 8 is genuinely printed to look like a 3 scores above 90% and is
 * wrong. So engine confidence catches an unreadable receipt and never catches a
 * confidently misread one, which is the case that matters: 24,90 read as 2490 is
 * a perfectly plausible number that is a hundred times too big, and a plausible
 * wrong number is precisely what a person checking a screen does not catch.
 *
 * This project has had that exact failure three times already — a truncated pie
 * legend that looked deliberate, a chart describing the wrong period, a date
 * quietly falling back to today. Every time, a fallback produced a plausible
 * value rather than an absent one.
 *
 * WHAT IS USED INSTEAD
 * --------------------
 * A receipt is a redundant document. It says the same thing more than once, and
 * those statements are arithmetic, so they can be checked against each other:
 *
 *   1. the lines add up to the total
 *   2. the VAT figure is a known rate of the total
 *   3. the amount paid by card is the total again
 *
 * None of those depends on how confident the OCR felt. Two readings that agree
 * corroborate each other; two that disagree mean at least one is wrong, and that
 * is worth far more than a percentage.
 */

/** Cents of slack, for the rounding a receipt does line by line. */
const CENT_TOLERANCE = 0.02;

/**
 * VAT rates a Finnish receipt can carry.
 *
 * 25.5% standard since September 2024, 14% on food and restaurants, 10% on
 * books, medicine, transport and accommodation. A receipt can mix them, which is
 * why any single rate matching is enough to corroborate rather than all of them
 * having to.
 */
const VAT_RATES = [25.5, 14, 10] as const;

/** Above this, a single receipt is unusual enough to be worth saying so. */
const UNUSUALLY_LARGE = 5_000;

const round = (value: number) => Math.round(value * 100) / 100;
const close = (a: number, b: number, tolerance = CENT_TOLERANCE) => Math.abs(a - b) <= tolerance;

type Check = { name: string; agrees: boolean; detail: string };

export type ReceiptReadings = {
  total: MoneyToken | null;
  /** The total printed a second time, as the amount taken by card. */
  alsoPaid: MoneyToken | null;
  vat: MoneyToken | null;
  itemTokens: MoneyToken[];
  /**
   * Whether the receipt had a discount line.
   *
   * It changes what a mismatch means. Discounts are excluded from the items,
   * because a receipt rarely marks their sign in a way OCR preserves, so a
   * discounted receipt legitimately has lines adding up to *more* than the
   * total. Without knowing one was there, that gap looks like a misread.
   */
  hadDiscountLine: boolean;
};

/**
 * Do the lines add up?
 *
 * The strongest of the three, and the one that catches both of the readings
 * worth worrying about. Items summing to 24,90 against a total of 2490 is not a
 * rounding difference, and neither is a total of 4,90.
 *
 * The asymmetry is deliberate. Lines adding up to *less* than the total means
 * money in the total that nothing on the receipt accounts for — always wrong.
 * Lines adding up to *more* is what a discount looks like, so when the receipt
 * showed a discount this declines to have an opinion rather than crying wolf.
 */
function itemsCheck(candidate: number, readings: ReceiptReadings): Check | null {
  if (readings.itemTokens.length === 0) return null;

  const sum = round(readings.itemTokens.reduce((running, token) => running + token.value, 0));

  if (close(sum, candidate)) {
    return { name: "the lines on it", agrees: true, detail: `they add up to ${sum.toFixed(2)}` };
  }

  if (sum > candidate && readings.hadDiscountLine) return null;

  return {
    name: "the lines on it",
    agrees: false,
    detail: `they add up to ${sum.toFixed(2)}`,
  };
}

/** Which known VAT rate this figure implies for that total, if any. */
function rateFor(total: number, vat: number): number | null {
  for (const rate of VAT_RATES) {
    const expected = total * (rate / (100 + rate));
    if (close(vat, expected, Math.max(0.03, expected * 0.02))) return rate;
  }
  return null;
}

/**
 * Is the VAT a believable share of the total?
 *
 * Independent of the lines, which matters: a receipt with one item and a VAT
 * line still gets checked, and a hundredfold error in the total fails every rate
 * at once rather than squeaking past one of them.
 */
function vatCheck(candidate: number, readings: ReceiptReadings): Check | null {
  if (!readings.vat) return null;

  const rate = rateFor(candidate, readings.vat.value);
  return rate === null
    ? {
        name: "the VAT line",
        agrees: false,
        detail: `${readings.vat.value.toFixed(2)} is not 25.5%, 14% or 10% of ${candidate.toFixed(2)}`,
      }
    : { name: "the VAT line", agrees: true, detail: `${readings.vat.value.toFixed(2)} is ${rate}% of it` };
}

/** The card line should be the total over again. */
function paidCheck(candidate: number, readings: ReceiptReadings): Check | null {
  if (!readings.alsoPaid) return null;

  return close(readings.alsoPaid.value, candidate)
    ? { name: "the amount paid", agrees: true, detail: `the card line says ${readings.alsoPaid.value.toFixed(2)}` }
    : {
        name: "the amount paid",
        agrees: false,
        detail: `the card line says ${readings.alsoPaid.value.toFixed(2)}`,
      };
}

/**
 * What the reading should probably have been.
 *
 * Knowing a total is wrong is useful; knowing what it should be is far more so,
 * and the arithmetic that caught the error usually says. Two ways, in order of
 * how conclusive they are:
 *
 *   1. **The dropped separator.** Losing the comma multiplies by a hundred and
 *      is the commonest money error OCR makes. If dividing by a hundred makes a
 *      failing check pass, that is close to proof, because a coincidence would
 *      have to satisfy independent arithmetic.
 *   2. **The lines themselves.** If they add up and the total does not, the sum
 *      is the better figure by construction.
 *
 * Null when neither applies — in which case the interface asks rather than
 * offers, which is the honest thing to do with a number nobody can pin down.
 */
function suggestionFor(candidate: number, readings: ReceiptReadings): number | null {
  const divided = round(candidate / 100);
  const asIfDivided: ReceiptReadings = readings;

  const dividedAgrees =
    itemsCheck(divided, asIfDivided)?.agrees === true || vatCheck(divided, asIfDivided)?.agrees === true;
  if (dividedAgrees) return divided;

  if (readings.itemTokens.length > 0 && !readings.hadDiscountLine) {
    return round(readings.itemTokens.reduce((running, token) => running + token.value, 0));
  }

  if (readings.alsoPaid) return readings.alsoPaid.value;

  return null;
}

/**
 * Whether the total looks like a separator went missing.
 *
 * A whole number of euros on a receipt whose other amounts all carry cents.
 * Supermarkets do not price things at exactly 2490,00. On its own this only
 * raises suspicion — it becomes an answer when dividing by a hundred makes the
 * arithmetic work, which `suggestionFor` tests.
 */
function looksLikeADroppedSeparator(total: MoneyToken, readings: ReceiptReadings): boolean {
  if (total.hasCents) return false;
  const others = [...readings.itemTokens, readings.vat, readings.alsoPaid].filter(
    (token): token is MoneyToken => token !== null,
  );
  return others.length > 0 && others.some((token) => token.hasCents);
}

/**
 * The verdict.
 *
 * Any disagreement wins over any agreement. That is the safe direction: two
 * checks where one agrees and one does not means something on this receipt is
 * misread, and which of the two is the wrong one is not for this function to
 * decide — it is exactly what a person looking at the photo can settle in a
 * second and an algorithm cannot settle at all.
 *
 * Size is deliberately never a reason on its own to reject a total. A five
 * thousand euro receipt is unusual, not impossible, and refusing one because it
 * is large would be the parser overruling the evidence. It is reported as
 * unverified with the size named, and a person decides.
 */
export function verdictFor(readings: ReceiptReadings): TotalVerdict {
  if (!readings.total) {
    return { kind: "absent", why: "No line on this receipt said what the total was." };
  }

  const candidate = readings.total.value;
  const checks = [
    itemsCheck(candidate, readings),
    vatCheck(candidate, readings),
    paidCheck(candidate, readings),
  ].filter((check): check is Check => check !== null);

  const disagreeing = checks.filter((check) => !check.agrees);

  if (disagreeing.length > 0) {
    const first = disagreeing[0]!;
    const dropped = looksLikeADroppedSeparator(readings.total, readings);
    return {
      kind: "contradicted",
      read: candidate,
      suggested: suggestionFor(candidate, readings),
      problem: dropped
        ? `${first.name} disagree — ${first.detail}, and the total has no cents, which is what a lost decimal comma looks like`
        : `${first.name} disagree — ${first.detail}`,
    };
  }

  const agreeing = checks.find((check) => check.agrees);
  if (agreeing) {
    return { kind: "corroborated", total: candidate, by: `${agreeing.name} agree: ${agreeing.detail}` };
  }

  return {
    kind: "unverified",
    total: candidate,
    why:
      candidate > UNUSUALLY_LARGE
        ? "Nothing else on this receipt confirms it, and it is an unusually large amount."
        : "Nothing else on this receipt — no line items, no VAT line — confirms it.",
  };
}
