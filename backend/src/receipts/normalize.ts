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

/** The amount at the end of a line, which is where a receipt puts it. */
function lastAmount(line: string): MoneyToken | null {
  const tokens = moneyTokens(line).filter((token) => !token.negative);
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
function amountForLabel(lines: string[], index: number): MoneyToken | null {
  const own = lastAmount(lines[index] ?? "");
  if (own) return own;

  const next = lines[index + 1];
  return next && isJustAnAmount(next) ? lastAmount(next) : null;
}

/**
 * The total, and the second printing of it if there is one.
 *
 * Only lines that actually say so are considered. A receipt whose total line was
 * lost to a bad photo gets no total rather than the biggest number on the page.
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
      alsoPaid = amountForLabel(lines, index);
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
} {
  const items: ReceiptItem[] = [];
  const tokens: MoneyToken[] = [];
  let hadDiscountLine = false;

  for (const [index, line] of lines.entries()) {
    if (lineHasKeyword(line, DISCOUNT_WORDS)) hadDiscountLine = true;
    if (lineHasKeyword(line, NOT_AN_ITEM_WORDS)) continue;

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
    // A genuine whole-euro item is missed by this, and that is the safe
    // direction: the sum then disagrees with the total and a person is asked,
    // rather than a wrong sum quietly confirming a wrong total.
    if (!amount.hasCents) continue;

    // What is left once the amount is taken away. A line of nothing but digits
    // is a reference number; a line with words is something bought.
    const description = line
      .replace(amount.raw, " ")
      .replace(/[^\p{L}\s&'.-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (description.replace(/[^\p{L}]/gu, "").length < 2) continue;

    items.push({ description, amount: amount.value });
    tokens.push(amount);
  }

  return { items, tokens, hadDiscountLine };
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

    candidates.push(trimmed.replace(/\s+/g, " "));
    if (candidates.join(" ").length >= 4) break;
  }

  const name = candidates.join(" ").trim();
  if (name.replace(/[^\p{L}]/gu, "").length < 2) return null;
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
  const { items, tokens: itemTokens, hadDiscountLine } = findItems(lines);
  const currency = findCurrency(lines);

  const verdict = verdictFor({ total, alsoPaid, vat, itemTokens, hadDiscountLine });

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
