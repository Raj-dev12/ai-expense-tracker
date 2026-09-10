/**
 * Reading words off a receipt that OCR has damaged.
 *
 * A thermal receipt photographed on a phone gives up characters constantly, and
 * always in the same directions: `O` becomes `0`, `l` and `I` become `1`, `S`
 * becomes `5`. "TOTAL" arrives as "T0TAL", "TOTAI", "T0TAI", "Totai".
 *
 * WHY THIS IS NOT A LIST OF MISSPELLINGS
 * -------------------------------------
 * The obvious fix is to write down every damaged spelling seen so far. That is a
 * whitelist, and this project has now twice had a whitelist walked around by
 * input nobody anticipated — the query box only answering phrasings it had been
 * taught, and the merchant step only finding names in shapes it had been taught.
 * A list of misspellings has the same failure: it works until the next photo.
 *
 * So the damage is *undone* instead. Confusable characters are folded back to
 * the letter they were probably meant to be, accents are dropped, and what is
 * left is compared to the keyword with one edit's worth of slack. That covers
 * spellings nobody has seen yet, which is the point.
 */

/**
 * Characters OCR confuses, mapped back to the letter they were probably meant
 * to be.
 *
 * One-directional on purpose: digits fold to letters, never the reverse. These
 * are only ever applied when asking "is this word a keyword", never to a number,
 * so a genuine `0` in an amount is untouched.
 */
const CONFUSABLE: Record<string, string> = {
  "0": "o",
  "1": "l",
  "5": "s",
  "8": "b",
  "6": "b",
  "2": "z",
  "|": "l",
  "!": "l",
  "¡": "l",
  "@": "a",
  $: "s",
  "€": "e",
  "£": "l",
};

/** Accented vowels folded to plain ones, so "YHTEENSÄ" and "YHTEENSA" are one word. */
const ACCENTS: Record<string, string> = {
  "ä": "a", "å": "a", "á": "a", "à": "a", "â": "a",
  "ö": "o", "ø": "o", "ó": "o", "ò": "o", "ô": "o",
  "ü": "u", "ú": "u", "ù": "u", "û": "u",
  "é": "e", "è": "e", "ê": "e", "ë": "e",
  "í": "i", "ì": "i", "î": "i", "ï": "i",
};

/**
 * Fold a word down to the letters it was probably meant to have.
 *
 * Everything that is not a letter after folding is dropped, which also removes
 * the stray punctuation OCR sprinkles into a line: "T0TAL:" and "TOTAL" end up
 * the same.
 */
export function deOcr(word: string): string {
  return [...word.toLowerCase()]
    .map((character) => ACCENTS[character] ?? CONFUSABLE[character] ?? character)
    .filter((character) => character >= "a" && character <= "z")
    .join("");
}

/**
 * How many single-character edits separate two words.
 *
 * The ordinary Levenshtein distance, capped: once it is clear the answer is
 * larger than `limit` there is no reason to keep going, and every caller here
 * only wants to know whether it is small.
 */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current.push(value);
      best = Math.min(best, value);
    }

    // Every path through this row already costs more than the caller cares
    // about, so no later row can come back under the limit.
    if (best > limit) return limit + 1;
    previous = current;
  }

  return previous[b.length] ?? limit + 1;
}

/**
 * How much slack a keyword gets, by length.
 *
 * One edit on a short word is a large proportion of it: "sum" is one edit from
 * "sam", "sun" and "sub", and a receipt has plenty of three-letter words. Long
 * words can afford the slack, short ones cannot.
 */
function slackFor(keyword: string): number {
  if (keyword.length <= 4) return 0;
  if (keyword.length <= 7) return 1;
  return 2;
}

/** Whether a word from the receipt is one of these keywords, damage allowed. */
export function matchesKeyword(word: string, keywords: readonly string[]): boolean {
  const folded = deOcr(word);
  if (!folded) return false;

  return keywords.some((keyword) => {
    if (folded === keyword) return true;
    return editDistance(folded, keyword, slackFor(keyword)) <= slackFor(keyword);
  });
}

/** Whether any word in a line is one of these keywords. */
export function lineHasKeyword(line: string, keywords: readonly string[]): boolean {
  return line.split(/[\s:.,;]+/).filter(Boolean).some((word) => matchesKeyword(word, keywords));
}

/**
 * The keyword sets, already folded the way `deOcr` folds a word.
 *
 * Written in their folded form — no accents, lowercase — because that is what
 * they are compared against. "yhteensa" rather than "yhteensä" is not a
 * misspelling here, it is the normalised form.
 */
export const TOTAL_WORDS = ["total", "yhteensa", "summa", "sum", "kaikkiyhteensa"] as const;

/**
 * A second printing of the same figure, which is what makes it checkable.
 *
 * Most receipts state the total again as the amount tendered — by card, in cash,
 * or as "paid". Two independent readings of one number is free corroboration.
 */
export const PAID_WORDS = ["kortti", "pankkikortti", "card", "paid", "maksettu", "debit", "credit", "visa"] as const;

export const VAT_WORDS = ["alv", "vat", "moms", "tax", "vero"] as const;

/**
 * Lines that reduce the bill.
 *
 * Excluded from the items like any other non-item line, but counted separately,
 * because their absence is what makes "the lines add up to more than the total"
 * a misread rather than an ordinary discounted receipt. OCR rarely preserves the
 * minus sign reliably enough to simply add them in with a negative value.
 */
export const DISCOUNT_WORDS = ["alennus", "alennukset", "discount", "etu", "bonus", "hyvitys"] as const;

/**
 * Lines that carry money but are not things bought.
 *
 * They have to be excluded before the items are summed, or the sum is compared
 * against a total that includes the change handed back.
 */
export const NOT_AN_ITEM_WORDS = [
  "valisumma", "subtotal", "netto", "net", "brutto", "gross",
  "alennus", "discount", "alennukset",
  "vaihtoraha", "change", "takaisin",
  "kateinen", "cash", "annettu", "tendered",
  "yhteensa", "total", "summa", "sum",
  "alv", "vat", "moms", "vero",
  "kortti", "pankkikortti", "card", "paid", "maksettu",
  "kuitti", "receipt", "kassa", "myyja", "puh", "tel", "www",
] as const;
