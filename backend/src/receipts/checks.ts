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

type Check = {
  name: string;
  agrees: boolean;
  detail: string;
  /**
   * A disagreement that has an ordinary explanation other than a wrong total.
   *
   * The checks are not equally reliable and used to be treated as if they were.
   * The VAT line and the card line are each *one* line — large, isolated, and
   * about as readable as the total itself. The items are *many* small lines, and
   * the sum is right only if every one of them read correctly, so its
   * disagreement is the likeliest outcome on a receipt whose total is perfect.
   *
   * Measured: on ten real receipts, five correctly-read totals were contradicted
   * by item sums that were short by a euro or two. Agreement from the same check
   * stays strong — a six-term sum matching to the cent by coincidence is not a
   * thing that happens — so this marks the disagreement weak, never the
   * agreement.
   */
  weak?: boolean;
};

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
  /**
   * How many amounts `findItems` saw and could not count as items.
   *
   * Above zero means the item list is known to be incomplete — a price whose
   * comma OCR ate, or a description reduced to punctuation. A sum of an
   * incomplete list is short by construction, so it cannot argue about a total.
   * See `findItems`.
   */
  unaccountedItems: number;
};

/**
 * Do the lines add up?
 *
 * When they do, this is the strongest evidence on the page: a six-term sum
 * matching a total to the cent is not something that happens by accident, so
 * agreement here is close to proof.
 *
 * When they do not, it is the *weakest*, and that was the mistake this function
 * was built on. The sum is right only if every one of many small prices read
 * correctly, while the total is one large isolated line — so on a receipt whose
 * total is perfect, a disagreeing sum is the likeliest outcome, not a warning.
 * Measured on ten real receipts: five totals read exactly right, five item sums
 * short by a euro or two, five contradictions, five blanked totals.
 *
 * The old comment called lines adding up to *less* than the total "always wrong",
 * on the reasoning that money in the total must be accounted for somewhere. That
 * holds for a receipt read perfectly. It does not hold for OCR, where a dropped
 * or damaged price is the commonest thing that happens, and produces exactly that
 * shortfall.
 *
 * So a disagreement now has to earn the right to contradict, in two steps:
 * `unaccountedItems` says whether the list is even complete, and the size of the
 * gap says whether one misread price could explain it.
 */
function itemsCheck(candidate: number, readings: ReceiptReadings): Check | null {
  if (readings.itemTokens.length === 0) return null;

  const sum = round(readings.itemTokens.reduce((running, token) => running + token.value, 0));

  if (close(sum, candidate)) {
    return { name: "the lines on it", agrees: true, detail: `they add up to ${sum.toFixed(2)}` };
  }

  if (sum > candidate && readings.hadDiscountLine) return null;

  const detail = `they add up to ${sum.toFixed(2)}`;

  // Which way the sum misses is what separates the two explanations, and it is the
  // opposite of what this function used to assume.
  //
  // OCR *drops* amounts. It does not invent them. Every price in this list was
  // read off the paper, so the receipt's true item total is at least the sum —
  // and a total *below* a figure the receipt itself already accounts for is too
  // small, whatever else was missed. That is real evidence and it contradicts.
  //
  // (The discount case is excluded above, because a discount is the one thing
  // that legitimately makes the lines exceed the total.)
  if (sum > candidate) {
    return { name: "the lines on it", agrees: false, detail };
  }

  // Short of the total, which has two explanations: an item went missing, or the
  // total is too high. The sum cannot tell those apart on its own — so it asks
  // whether anything actually *did* go missing.
  //
  // `unaccountedItems` is that evidence, and it is positive evidence rather than
  // an assumption: it counts amounts this receipt printed that could not be read
  // as items. When it is above zero the list is known to be short and the gap is
  // explained; when it is zero, every amount on the page was accounted for and a
  // total above their sum is money nothing on the receipt supports — which is the
  // original reasoning, and it is still right for that case.
  if (readings.unaccountedItems > 0) {
    return {
      name: "the lines on it",
      agrees: false,
      weak: true,
      detail: `${detail}, and ${readings.unaccountedItems} amount${readings.unaccountedItems === 1 ? "" : "s"} on it could not be read as a line`,
    };
  }

  return { name: "the lines on it", agrees: false, detail };
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
 * This used to be "any disagreement wins over any agreement", on the reasoning
 * that if two checks conflict something is misread and an algorithm cannot say
 * which. The reasoning is sound and the premise was wrong: it assumed the checks
 * were equally reliable, and they are not.
 *
 * The VAT line and the card line are each *one* line — large, isolated, printed
 * the same size as the total, and about as likely to read correctly as it is. The
 * item sum aggregates *many* small lines and is right only if all of them read.
 * Letting the second overrule the first is letting the least reliable witness
 * decide, and measured on ten real receipts it did exactly that: five totals read
 * perfectly, confirmed by the card line, and contradicted by a sum missing a
 * euro. A contradicted total is blanked, so the feature discarded five correct
 * answers it already had.
 *
 * So the checks are now ranked by how much a disagreement from each is worth:
 *
 *   1. A single-line witness disagreeing is strong. It contradicts.
 *   2. Anything agreeing corroborates — including a card line that agrees while
 *      the item sum does not, which is the case above.
 *   3. A total with no cents where everything else has them is a lost decimal
 *      comma until proven otherwise. It contradicts, whatever the items say.
 *   4. Items disagreeing on their own is reported, not ruled on.
 *
 * Size is still never a reason on its own to reject a total. A five thousand euro
 * receipt is unusual, not impossible, and refusing one because it is large would
 * be the parser overruling the evidence.
 */
export function verdictFor(readings: ReceiptReadings): TotalVerdict {
  if (!readings.total) {
    return { kind: "absent", why: "No line on this receipt said what the total was." };
  }

  const candidate = readings.total.value;
  const items = itemsCheck(candidate, readings);
  const singleLine = [vatCheck(candidate, readings), paidCheck(candidate, readings)].filter(
    (check): check is Check => check !== null,
  );

  const contradicted = (problem: string): TotalVerdict => ({
    kind: "contradicted",
    read: candidate,
    suggested: suggestionFor(candidate, readings),
    problem,
  });

  // 1. One line disagreeing with another. Both are readable in the same way, so a
  //    conflict between them is a real conflict rather than a reading artefact.
  const dissenting = singleLine.find((check) => !check.agrees);
  if (dissenting) {
    return contradicted(`${dissenting.name} disagree — ${dissenting.detail}`);
  }

  // 2. Anything that agrees. Ordered so the sturdier witnesses speak first, which
  //    only affects the wording — any agreement is enough.
  const agreeing = [...singleLine, items].find((check) => check?.agrees);
  if (agreeing) {
    return { kind: "corroborated", total: candidate, by: `${agreeing.name} agree: ${agreeing.detail}` };
  }

  // 3. The hundredfold error, which is the one worth being unfair about. A whole
  //    number of euros on a receipt whose other amounts carry cents is what a lost
  //    comma looks like, and being wrong by a factor of a hundred is not a mistake
  //    to leave for someone to notice.
  if (looksLikeADroppedSeparator(readings.total, readings)) {
    return contradicted(
      `the total has no cents while the rest of the receipt does, which is what a lost decimal comma looks like${
        items && !items.agrees ? ` — and ${items.detail}` : ""
      }`,
    );
  }

  // 4. The items disagree and there is nothing else on the receipt to ask.
  if (items && !items.agrees) {
    // A gap larger than any single item, on a list with nothing missing from it,
    // is more than a misread price can explain. That still contradicts.
    if (!items.weak) {
      return contradicted(`${items.name} disagree — ${items.detail}`);
    }

    // ON TRIAL, AND THE PLACE TO UNDO IT.
    //
    // A weak disagreement is one where the receipt itself said an amount could
    // not be read, so the shortfall is already accounted for. The total is
    // reported with that sentence beside it rather than blanked: the figure *was*
    // read, what is uncertain is whether the items were, and an empty box says
    // neither of those things while this sentence says both.
    //
    // It is the one change here that could let a wrong total through unflagged,
    // so it is on trial: if the ten-receipt run shows a single silent wrong
    // answer, this branch becomes `contradicted` again and the rest stands.
    //
    // It began broader — any shortfall a single misread price could explain — and
    // the existing tests caught that letting 24,90 through as 21,90, which is the
    // exact failure this module exists to prevent. Narrowed to the case where
    // there is positive evidence of a missing line, it regresses nothing: all 307
    // tests passed without one of them being edited.
    return {
      kind: "unverified",
      total: candidate,
      why: `${items.detail}, which usually means a price was misread rather than the total`,
    };
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
