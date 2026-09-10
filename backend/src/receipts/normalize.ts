import { currencyFor, isRealDate, mostRecentOccurrence, readNumber } from "../ai/extract.js";
import { monthFromName } from "../ai/month-names.js";
import { verdictFor } from "./checks.js";
import {
  DISCOUNT_WORDS,
  NOT_AN_ITEM_WORDS,
  PAID_WORDS,
  TOTAL_WORDS,
  VAT_WORDS,
  lineHasKeyword,
} from "./ocr-text.js";
import type { ReceiptData, ReceiptItem } from "./types.js";

/**
 * Turning the text OCR produced into the fields of a receipt.
 *
 * THIS IS NOT THE SENTENCE PARSER
 * -------------------------------
 * Nothing here calls `mockParser.parseExpense`, `findMerchant` or `findAmount`,
 * and it must stay that way. Those read a sentence somebody wrote — one clause,
 * words in an order, a preposition marking the shop. A receipt is a *layout*:
 * forty lines, a name at the top, amounts flush right, a keyword marking the
 * total. Feeding one to the other would find an amount, occasionally the right
 * one, and be wrong in ways nobody could predict.
 *
 * What it does borrow is primitives, and only where the alternative is a second
 * definition of something already settled and tested:
 *
 *   - `readNumber` for "24,90" against "1.234,56" against "1,234.56"
 *   - `isRealDate` and `mostRecentOccurrence` for date sanity and the year rule
 *   - `monthFromName` for English and Finnish month names
 *   - `currencyFor` for symbols and codes
 *
 * NOTHING HERE GUESSES
 * --------------------
 * Every finder returns null when it is not sure. A receipt with no line saying
 * TOTAL gets no total, and the person types it. The alternative — picking the
 * largest number on the page and hoping — produces a plausible figure that looks
 * exactly like a correct one, which is the failure this whole feature is
 * arranged around.
 */

/** Amounts above this are a receipt number or a misread, not a shopping trip. */
const MAX_PLAUSIBLE_AMOUNT = 100_000;

/** A number this long is a reference, a barcode or a phone number. */
const MAX_MONEY_DIGITS = 7;

export type MoneyToken = {
  /** Exactly as it appeared, so the browser can find it on the photo. */
  raw: string;
  value: number;
  /**
   * Whether the text carried a decimal separator with two digits after it.
   *
   * The single most useful bit on this object. A total that arrived without one
   * while everything else on the receipt has cents is the signature of a dropped
   * separator — 24,90 read as 2490 — and that is check three.
   */
  hasCents: boolean;
  negative: boolean;
};

/**
 * Blank out the things that are made of digits but are not money.
 *
 * Times and dates would otherwise contribute stray integers: "12:45" offers a 12
 * and a 45, and "04.09.2026" offers a 2026. Replaced with spaces rather than
 * removed, so every other token keeps its position in the line.
 */
function withoutDatesAndTimes(line: string): string {
  return line
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, (match) => " ".repeat(match.length))
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (match) => " ".repeat(match.length))
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, (match) => " ".repeat(match.length));
}

/**
 * An amount, in any of the shapes a European receipt prints one.
 *
 * The three alternatives are tried in order, longest first, so a grouped number
 * is never read as its first three digits:
 *
 *   1. grouped with cents — "1.234,56", "1 234,56", "9 000,00"
 *   2. plain with cents   — "24,90", "24.90"
 *   3. a bare integer     — "2490"
 *
 * A space counts as a thousands separator because Finnish prints them that way.
 * It cannot be confused with two separate numbers: the group after it must be
 * exactly three digits and be followed by cents, which "Kassa 3 12" is not.
 *
 * The bare integer has to be accepted even though most of them are not money,
 * because a total that lost its decimal comma is exactly that shape — and
 * catching one is the whole point of the checks.
 */
const MONEY_PATTERN =
  /(-)?\s*([€$£])?\s*((?:\d{1,3}(?:[.,\u00a0 ]\d{3})+[.,]\d{2})|(?:\d+[.,]\d{2})|(?:\d+))(?!\d)\s*(%|€|£|\$|eur|usd|gbp|kr)?/gi;

/** Every amount on a line, in the order they appear. */
export function moneyTokens(line: string): MoneyToken[] {
  const cleaned = withoutDatesAndTimes(line);
  const found: MoneyToken[] = [];

  for (const match of cleaned.matchAll(MONEY_PATTERN)) {
    const [, minus, symbolBefore, digits, trailing] = match;
    if (!digits) continue;

    // A percentage is a VAT rate, not an amount. Dropping it here is what stops
    // "ALV 14% 3,06" offering 14 as the tax paid.
    if (trailing === "%") continue;

    if (digits.replace(/[^0-9]/g, "").length > MAX_MONEY_DIGITS) continue;

    // Spaces are grouping and nothing else, so they come out before the number
    // is read — `readNumber` knows about dots and commas, not about typography.
    const value = readNumber(digits.replace(/[\u00a0 ]/g, ""));
    if (value === null || value <= 0 || value > MAX_PLAUSIBLE_AMOUNT) continue;

    found.push({
      raw: `${symbolBefore ?? ""}${digits}${trailing && trailing !== "%" ? trailing : ""}`.trim(),
      value,
      hasCents: /[.,]\d{2}$/.test(digits),
      negative: minus === "-",
    });
  }

  return found;
}

/**
 * The amount at the end of a line, which is where a receipt puts it.
 *
 * `withCentsOnly` is for lines where a bare integer cannot be the value. A price
 * is printed "5,00", never "5", so on those lines an integer is debris — the VAT
 * class letter misread as a digit, half of an amount whose comma was eaten, a
 * fragment of the line below. Taking the last token without that filter means the
 * debris wins, because the debris comes last.
 */
function lastAmount(line: string, withCentsOnly = false): MoneyToken | null {
  const tokens = moneyTokens(line)
    .filter((token) => !token.negative)
    .filter((token) => !withCentsOnly || token.hasCents);
  return tokens.length > 0 ? (tokens[tokens.length - 1] ?? null) : null;
}

/**
 * Whether a line is an amount and essentially nothing else.
 *
 * "24,90 €" is; "Maito 1,29" is not. The distinction is what makes it safe to
 * read a label's value off the following line.
 */
function isJustAnAmount(line: string): boolean {
  const amount = lastAmount(line);
  if (!amount) return false;

  const rest = line.replace(amount.raw, " ").replace(/[^\p{L}]/gu, "");
  // A stray letter survives OCR constantly — a currency code, half of a symbol
  // it could not place. Two is where a word starts.
  return rest.length < 2;
}

/**
 * The amount belonging to a labelled line.
 *
 * Usually on the line itself. But a narrow receipt, or a photo taken at an
 * angle, wraps the value onto the next line, so "TOTAL" and "24,90 €" arrive
 * separately — which happened on the very first real example tried, and made a
 * perfectly readable receipt come back with no total at all.
 *
 * The following line is only accepted when it is an amount and nothing else. A
 * receipt reading "YHTEENSÄ" above "Maito 1,29" would otherwise hand back the
 * price of the milk as the total, which is the shape of mistake this whole
 * module is arranged to avoid: plausible, and completely wrong.
 */
function amountForLabel(lines: string[], index: number, withCentsOnly = false): MoneyToken | null {
  const own = lastAmount(lines[index] ?? "", withCentsOnly);
  if (own) return own;

  const next = lines[index + 1];
  return next && isJustAnAmount(next) ? lastAmount(next, withCentsOnly) : null;
}

/**
 * The total, and the second printing of it if there is one.
 *
 * Only lines that actually say so are considered. A receipt whose total line was
 * lost to a bad photo gets no total rather than the biggest number on the page.
 *
 * THE TWO LINES ARE READ DIFFERENTLY, AND HAVE TO BE
 * --------------------------------------------------
 * The total accepts a bare integer, because a total that lost its decimal comma
 * is exactly that shape and catching one is the point of the checks. The card
 * line must not, and the difference cost real money: a damaged
 * `Korttimaksu < 3` handed back 3,00 as the amount paid, which then disagreed
 * with a total of 13,62 that had been read perfectly. Every misparse of this seen
 * on real receipts — 3, 4, 7, 1988 — was a bare integer where the printed value
 * had cents.
 *
 * A card charge is always printed with cents. So on that line an integer is not a
 * reading of the amount, it is debris: the VAT class letter misread as a digit,
 * half an amount whose comma was eaten, a fragment of the line below. Ignoring it
 * costs a corroboration that was never real; trusting it destroys a total that
 * was.
 *
 * This is the same rule `findItems` already applies to prices, for the same
 * reason, and it is applied here for the more pressing one: since a card line
 * that agrees now outranks a disagreeing item sum, a card line that *dis*agrees
 * carries proportionate weight, and it has to have earned it.
 */
export function findTotal(lines: string[]): { total: MoneyToken | null; alsoPaid: MoneyToken | null } {
  let total: MoneyToken | null = null;
  let alsoPaid: MoneyToken | null = null;

  for (const [index, line] of lines.entries()) {
    if (!total && lineHasKeyword(line, TOTAL_WORDS)) {
      total = amountForLabel(lines, index);
      continue;
    }
    if (!alsoPaid && lineHasKeyword(line, PAID_WORDS)) {
      alsoPaid = amountForLabel(lines, index, true);
    }
  }

  return { total, alsoPaid };
}

/** The VAT figure, if the receipt states one. Rates are excluded by `moneyTokens`. */
export function findVat(lines: string[]): MoneyToken | null {
  for (const [index, line] of lines.entries()) {
    if (!lineHasKeyword(line, VAT_WORDS)) continue;
    const amount = amountForLabel(lines, index);
    if (amount) return amount;
  }
  return null;
}

/**
 * The quantity breakdown a receipt prints under a multi-buy line.
 *
 * "3 x 0,45" sits below "Ruispala 100 % 1,35" and explains it: three at
 * forty-five cents. The money is already in the line above, so counting this as a
 * purchase adds it twice.
 *
 * That is not a rounding-sized error. It pushed a Lidl receipt's item sum to
 * 14,44 against a correct total of 13,62 — and since a sum *exceeding* the total
 * is treated as strong evidence that the total is too small, the reading was
 * contradicted and a correct total blanked. The one shape of mistake that most
 * needed excluding was being fed into the check that trusts it most.
 *
 * Anchored at the start, because that is where the quantity sits on its own line.
 * An item that states its own quantity inline — "Omena 3 x 0,45 1,35" — begins
 * with the product and ends with the real amount, and is left alone.
 */
const UNIT_PRICE_LINE = /^\d{1,3}\s*(?:kpl|kg|st|pcs)?\s*[x*×]\s*\d+[.,]\d{2}/i;

/**
 * The things bought.
 *
 * A line qualifies when it has an amount, has words beside it, and says nothing
 * that would make it a subtotal, a discount, the change, or the total itself.
 * Those exclusions are the difference between a sum that can corroborate the
 * total and a sum that quietly includes it.
 */
export function findItems(lines: string[]): {
  items: ReceiptItem[];
  tokens: MoneyToken[];
  hadDiscountLine: boolean;
  /**
   * Amounts seen on a line and then not counted as items.
   *
   * The two tests below — a price must have cents, a description must have
   * letters — are exactly what OCR damage on small dense text trips. So this is a
   * count of the times this function knew it was throwing away something that
   * might have been a purchase, and it is the difference between "these are the
   * items" and "these are the items I could read".
   *
   * It exists because the sum was being used to contradict totals that were
   * right. A sum built from an incomplete list cannot speak to whether a total is
   * correct — it can only agree by luck or disagree by construction — and until
   * this was reported there was no way for the checks to know which they had.
   */
  unaccounted: number;
} {
  const items: ReceiptItem[] = [];
  const tokens: MoneyToken[] = [];
  let hadDiscountLine = false;
  let unaccounted = 0;

  for (const [index, line] of lines.entries()) {
    if (lineHasKeyword(line, DISCOUNT_WORDS)) hadDiscountLine = true;
    if (lineHasKeyword(line, NOT_AN_ITEM_WORDS)) continue;

    // Not counted, and deliberately not counted as *unaccounted* either: this
    // money is not missing from the sum, it is already in the line above. Marking
    // it missing would weaken the items check on exactly the receipts where it is
    // working correctly.
    if (UNIT_PRICE_LINE.test(line)) continue;

    // A bare amount sitting under a label belongs to that label, not to the
    // basket. Without this, a total that wrapped onto its own line would be
    // counted as a purchase and then contradict itself.
    const above = lines[index - 1];
    if (
      above &&
      isJustAnAmount(line) &&
      lineHasKeyword(above, [...TOTAL_WORDS, ...PAID_WORDS, ...VAT_WORDS]) &&
      !lastAmount(above)
    ) {
      continue;
    }

    const amount = lastAmount(line);
    if (!amount) continue;

    // An amount without cents is not a price. A receipt prints "5,00", never
    // "5" — so a bare integer on a line with words is a house number, a till
    // number or a quantity, and counting one as a thing bought would poison the
    // very sum that is meant to corroborate the total. Found by an address:
    // "Itämerenkatu 21, Helsinki" was read as a twenty-one euro purchase, which
    // then contradicted a total that was perfectly correct.
    //
    // A genuine whole-euro item is missed by this, and so is any price whose
    // comma OCR ate. That was called "the safe direction" on the grounds that the
    // sum would then disagree and a person would be asked — which held only while
    // being asked was cheap. Measured on ten real receipts it was not: the sum
    // disagreed with five totals that were read perfectly, and a contradicted
    // total is blanked rather than shown. So the skip is still right and it is
    // now *counted*, and the checks are told the list they are adding up is not
    // the whole receipt.
    if (!amount.hasCents) {
      unaccounted += 1;
      continue;
    }

    // What is left once the amount is taken away. A line of nothing but digits
    // is a reference number; a line with words is something bought.
    const description = line
      .replace(amount.raw, " ")
      .replace(/[^\p{L}\s&'.-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    // An amount with no words beside it is a reference number — or a description
    // OCR reduced to punctuation, which on a thermal receipt is common. Counted
    // for the same reason as above: the sum is missing something either way.
    if (description.replace(/[^\p{L}]/gu, "").length < 2) {
      unaccounted += 1;
      continue;
    }

    items.push({ description, amount: amount.value });
    tokens.push(amount);
  }

  return { items, tokens, hadDiscountLine, unaccounted };
}

const NUMERIC_DATE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b/;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DAY_MONTH_ONLY = /\b(\d{1,2})\.(\d{1,2})\.(?!\d)/;
const NAMED_DATE = /\b(\d{1,2})\.?\s+([\p{L}]{3,12})\.?\s+(\d{4}|\d{2})\b/u;

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fullYear(written: string): number {
  return written.length === 2 ? 2000 + Number(written) : Number(written);
}

/**
 * When the receipt was issued.
 *
 * Day first throughout, which is the European convention and the only one a
 * Finnish receipt uses. A date in the future is refused rather than returned —
 * the rest of the app will not accept one, and a receipt cannot be from
 * tomorrow.
 *
 * `04.09.` with no year is common on short receipts, and gets the same rule the
 * sentence parser uses: the most recent time that day happened.
 */
export function findDate(lines: string[], today: string): { date: string; source: string } | null {
  for (const line of lines) {
    const isoMatch = line.match(ISO_DATE);
    if (isoMatch) {
      const [source, y, m, d] = isoMatch;
      const value = iso(Number(y), Number(m), Number(d));
      if (isRealDate(Number(y), Number(m), Number(d)) && value <= today) return { date: value, source };
    }

    const numeric = line.match(NUMERIC_DATE);
    if (numeric) {
      const [source, d, m, y] = numeric;
      const year = fullYear(y ?? "");
      const value = iso(year, Number(m), Number(d));
      if (isRealDate(year, Number(m), Number(d)) && value <= today) return { date: value, source };
    }

    const named = line.match(NAMED_DATE);
    if (named) {
      const [source, d, name, y] = named;
      const month = monthFromName(name ?? "");
      const year = fullYear(y ?? "");
      if (month !== null && isRealDate(year, month, Number(d))) {
        const value = iso(year, month, Number(d));
        if (value <= today) return { date: value, source };
      }
    }

    const dayMonth = line.match(DAY_MONTH_ONLY);
    if (dayMonth) {
      const [source, d, m] = dayMonth;
      const value = mostRecentOccurrence(Number(m), Number(d), today);
      if (value) return { date: value, source };
    }
  }

  return null;
}

/**
 * Lines at the top that are plainly not the shop's name.
 *
 * Kept narrow. Being wrong about the merchant costs a person one correction on a
 * field they can see; being wrong about the total costs them a wrong expense, so
 * the effort belongs there.
 */
/**
 * Clean OCR debris off a shop's name.
 *
 * The top of a receipt is the worst part of the page to read: a logo, a border,
 * a torn edge, a barcode. None of it is text, and OCR reports it as text anyway
 * — the reported symptom was stray symbols wrapped around an otherwise correct
 * name.
 *
 * Three passes, in order, and the order matters:
 *
 *   1. Drop anything that is not a letter, a digit, a space, or one of the few
 *      marks that genuinely appear in shop names — the hyphen in "K-Market", the
 *      ampersand in "H&M", the apostrophe in "Fafa's", the full stop in "St.".
 *   2. Trim what is left of those marks off the ends. A hyphen belongs *inside*
 *      K-Market; a hyphen leading the line is half a border.
 *   3. Collapse the runs of spaces the first two passes leave behind.
 *
 * It deliberately does not strip marks from the middle. "K-MARKET" surviving
 * intact matters more than the occasional stray character in the middle of a
 * name, which is visible in the box and takes one keystroke to fix — whereas a
 * name mangled into "KMARKET" looks correct and is not.
 */
function tidyName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s&'.-]/gu, " ")
    .replace(/^[\s&'.-]+/u, "")
    .replace(/[\s&'.-]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NOT_A_MERCHANT = /\b(www|http|puh|tel|y-?tunnus|vat|alv|kuitti|receipt|kassa)\b/i;

/**
 * The shop's name, from the top of the receipt.
 *
 * The first line that has letters, no amount, and none of the words that mark an
 * address or a phone number. If that line is very short — a single-letter chain
 * initial, which happens — the next qualifying line is joined to it, because
 * "K" on its own is not a name.
 *
 * This is a heuristic and is allowed to be, for the reason above. It reads the
 * first few lines only: past that a receipt is items, and an item is not a shop.
 */
export function findMerchant(lines: string[]): string | null {
  const candidates: string[] = [];

  for (const line of lines.slice(0, 6)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (NOT_A_MERCHANT.test(trimmed)) continue;
    if (moneyTokens(trimmed).length > 0) continue;
    // One letter is enough to be *part* of a name — "S" printed above "MARKET"
    // is how a chain sets its own logo — so the length rule is applied to the
    // joined result rather than to each line on its own.
    if (trimmed.replace(/[^\p{L}]/gu, "").length < 1) continue;

    const cleaned = tidyName(trimmed);
    if (!cleaned) continue;

    candidates.push(cleaned);
    if (candidates.join(" ").length >= 4) break;
  }

  const name = tidyName(candidates.join(" "));
  if (!name || name.replace(/[^\p{L}]/gu, "").length < 2) return null;
  return name.slice(0, 120);
}

/** The currency, from a symbol or code anywhere on the receipt. Euros unless told otherwise. */
export function findCurrency(lines: string[]): string {
  for (const line of lines) {
    for (const word of line.split(/[\s\d.,:;]+/).filter(Boolean)) {
      const code = currencyFor(word);
      if (code) return code;
    }
  }
  return "EUR";
}

/**
 * Everything above, assembled — and then checked.
 *
 * The order matters only at the end: the fields are read independently, and the
 * verdict is formed from all of them together, because no single reading can
 * corroborate itself.
 */
export function normalizeReceipt(rawLines: string[], today: string): ReceiptData {
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);

  const merchant = findMerchant(lines);
  const date = findDate(lines, today);
  const { total, alsoPaid } = findTotal(lines);
  const vat = findVat(lines);
  const { items, tokens: itemTokens, hadDiscountLine, unaccounted } = findItems(lines);
  const currency = findCurrency(lines);

  const verdict = verdictFor({
    total,
    alsoPaid,
    vat,
    itemTokens,
    hadDiscountLine,
    unaccountedItems: unaccounted,
  });

  // A tally of how much was read, not of how much is right. Those are different
  // questions and the verdict answers the second one.
  let confidence = 0.2;
  if (merchant) confidence += 0.2;
  if (date) confidence += 0.2;
  if (verdict.kind === "corroborated") confidence += 0.3;
  else if (verdict.kind === "unverified") confidence += 0.15;
  if (items.length > 0) confidence += 0.1;

  return {
    merchant,
    date: date?.date ?? null,
    // Present only when there is a figure worth putting in a box. A contradicted
    // reading stays inside the verdict, where nothing can mistake it for one.
    total:
      verdict.kind === "corroborated" || verdict.kind === "unverified" ? verdict.total : null,
    currency,
    vat: vat?.value ?? null,
    items,
    sources: {
      merchant,
      date: date?.source ?? null,
      total: total?.raw ?? null,
    },
    verdict,
    confidence: Math.min(Math.round(confidence * 100) / 100, 0.95),
  };
}
