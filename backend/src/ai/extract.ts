import type { CategoryName } from "../lib/categories.js";
import { addDays } from "../lib/dates.js";

/**
 * The extraction steps used by the mock parser, in the order they must run.
 *
 * THE ORDERING RULE
 * -----------------
 * Each step takes the text it is given, finds the one thing it understands, and
 * hands back both the value and the exact words it used. Those words are then
 * removed before the next step runs, so no two steps can read the same
 * characters.
 *
 * The order is most-constrained first:
 *
 *   1. date     — three numbers in a fixed shape, with day and month ranges
 *   2. amount   — one number, optionally beside a currency
 *   3. merchant — whatever words are left over
 *
 * The reason is that a looser rule will happily swallow text belonging to a
 * stricter one, but never the reverse. "31,08,26" is a perfectly well-formed
 * grouped number under the separator rule — it reads as 310826 — and it is also
 * a perfectly well-formed date. Both rules are individually right; only their
 * order decides which wins. Running the date first, and consuming it, means the
 * amount rule never sees those digits.
 *
 * The alternative, adding "and it must not look like a date" to the amount rule,
 * and "and it must not look like an amount" to the merchant rule, makes every
 * rule know about every other rule. That is how the earlier bugs happened: the
 * merchant step rejected currency words and digits because it was reading text
 * the other steps had already claimed.
 */

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Work out what a written number means, whichever convention wrote it.
 *
 * English writes 1234.56 as "1,234.56"; most of Europe writes it "1.234,56".
 * Both characters do both jobs, so which is which has to be deduced. The rule is
 * about *grouping*, not about decimal places: a thousands separator always has
 * exactly three digits after it, because that is the only thing it does.
 *
 *   1. Both `.` and `,` appear — whichever comes last is the decimal separator.
 *   2. One kind, appearing more than once — it is grouping. "1.234.567".
 *   3. One kind, appearing once — grouping only if exactly three digits follow
 *      and one to three digits come before. "1,200" is 1200; "14,6" is 14.6.
 *
 * "1,200" stays genuinely ambiguous — it could be one euro twenty — but
 * three-digit grouping is the overwhelmingly common meaning, and the confirm
 * step exists for what a rule cannot settle.
 */
export function readNumber(raw: string): number | null {
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  let decimalSeparator: string | null = null;

  if (hasDot && hasComma) {
    decimalSeparator = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
  } else if (hasDot || hasComma) {
    const separator = hasDot ? "." : ",";
    const occurrences = raw.split(separator).length - 1;
    const digitsAfter = raw.length - raw.lastIndexOf(separator) - 1;
    const digitsBefore = raw.indexOf(separator);
    const looksLikeGrouping =
      occurrences > 1 || (digitsAfter === 3 && digitsBefore >= 1 && digitsBefore <= 3);
    decimalSeparator = looksLikeGrouping ? null : separator;
  }

  const value = decimalSeparator
    ? Number(
        `${raw.slice(0, raw.lastIndexOf(decimalSeparator)).replace(/[.,]/g, "")}.` +
          raw.slice(raw.lastIndexOf(decimalSeparator) + 1),
      )
    : Number(raw.replace(/[.,]/g, ""));

  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Is this a day that actually existed?
 *
 * JavaScript rolls impossible dates forward — the 31st of February becomes the
 * 3rd of March — so the only way to reject one is to build it and check every
 * part came back unchanged.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const built = new Date(Date.UTC(year, month - 1, day));
  return (
    built.getUTCFullYear() === year &&
    built.getUTCMonth() === month - 1 &&
    built.getUTCDate() === day
  );
}

export type DateFinding = {
  date: string;
  /** True when the sentence actually said a date, rather than defaulting to today. */
  explicit: boolean;
  /** The exact text used, so the caller can remove it before the next step. */
  matched: string | null;
};

/**
 * Find a date.
 *
 * Two written forms are understood:
 *
 *   - ISO, `2026-07-14`. Unambiguous, because a four-digit leading group cannot
 *     be a day.
 *   - Day first, `31.8.2026`, `31.08.26`, `31,08,26`, `31/8/26`. This is the
 *     Finnish convention and the one a Finnish user will actually type: day,
 *     then month, then a two- or four-digit year. The separator may be a dot, a
 *     comma, a slash or a hyphen, but it must be the *same* separator both
 *     times, so "31.08,26" is not read as a date.
 *
 * Two-digit years are read as 2000-something, which is the only reading that
 * makes sense for an expense tracker.
 *
 * A date that has not happened yet is refused rather than returned. The mock is
 * allowed to be wrong, but it is not allowed to produce a value its own
 * validation will reject — that turns a bad guess into a failed request.
 */
export function findDate(text: string, today: string): DateFinding {
  const iso = text.match(/\b([0-9]{4})-([0-9]{2})-([0-9]{2})\b/);
  if (iso) {
    const [matched, y, m, d] = iso;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const value = `${year}-${pad(month)}-${pad(day)}`;
    if (isRealDate(year, month, day) && value <= today) {
      return { date: value, explicit: true, matched };
    }
  }

  // Day first. The backreference forces the same separator in both places.
  const written = text.match(/\b([0-9]{1,2})([.,/-])([0-9]{1,2})\2([0-9]{4}|[0-9]{2})\b/);
  if (written) {
    const [matched, d, , m, y] = written;
    const rawYear = Number(y);
    const year = (y ?? "").length === 2 ? 2000 + rawYear : rawYear;
    const month = Number(m);
    const day = Number(d);
    const value = `${year}-${pad(month)}-${pad(day)}`;
    if (isRealDate(year, month, day) && value <= today) {
      return { date: value, explicit: true, matched };
    }
  }

  const phrases: Array<{ pattern: RegExp; resolve: (match: RegExpMatchArray) => string }> = [
    { pattern: /\bday before yesterday\b/i, resolve: () => addDays(today, -2) },
    { pattern: /\byesterday\b/i, resolve: () => addDays(today, -1) },
    { pattern: /\btoday\b/i, resolve: () => today },
    { pattern: /\bjust now\b/i, resolve: () => today },
    { pattern: /\blast week\b/i, resolve: () => addDays(today, -7) },
    {
      pattern: /\b([0-9]{1,3})\s+days?\s+ago\b/i,
      resolve: (match) => addDays(today, -Number(match[1])),
    },
    {
      pattern: /\b(?:last|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      resolve: (match) => {
        const wanted = WEEKDAYS.indexOf((match[1] ?? "").toLowerCase());
        const [year, month, day] = today.split("-").map(Number);
        const current = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
        // 1 to 7 rather than 0 to 6, so "last Monday" on a Monday means the
        // previous week rather than today.
        return addDays(today, -(((current - wanted + 6) % 7) + 1));
      },
    },
  ];

  for (const { pattern, resolve } of phrases) {
    const match = text.match(pattern);
    if (match) return { date: resolve(match), explicit: true, matched: match[0] };
  }

  return { date: today, explicit: false, matched: null };
}

// ---------------------------------------------------------------------------
// Amounts and currencies
// ---------------------------------------------------------------------------

const CURRENCY_WORDS: Record<string, string> = {
  "€": "EUR", eur: "EUR", euro: "EUR", euros: "EUR",
  $: "USD", usd: "USD", dollar: "USD", dollars: "USD",
  "£": "GBP", gbp: "GBP", pound: "GBP", pounds: "GBP", quid: "GBP",
  chf: "CHF", franc: "CHF", francs: "CHF",
  sek: "SEK", krona: "SEK", kronor: "SEK",
  nok: "NOK", dkk: "DKK",
  pln: "PLN", zloty: "PLN",
  czk: "CZK",
  "¥": "JPY", jpy: "JPY", yen: "JPY",
  cad: "CAD", aud: "AUD",
};

/**
 * Look a word up in the currency table.
 *
 * `CURRENCY_WORDS[word]` on its own would be a bug waiting to happen: plain
 * objects inherit properties like `constructor` and `toString`, so a sentence
 * containing one of those words would come back holding a function instead of a
 * currency code. `Object.hasOwn` asks whether the table itself has the key.
 */
export function currencyFor(word: string): string | null {
  const key = word.toLowerCase();
  return Object.hasOwn(CURRENCY_WORDS, key) ? (CURRENCY_WORDS[key] ?? null) : null;
}

export type AmountFinding = {
  amount: number | null;
  currency: string | null;
  matched: string | null;
};

/**
 * Find the amount, and the currency if one was written beside it.
 *
 * This runs after the date has been removed, which is what stops "31,08,26"
 * being read as three hundred and ten thousand.
 */
export function findAmount(text: string): AmountFinding {
  const pattern = /([€$£¥])?\s*([0-9]+(?:[.,][0-9]+)*)\s*([€$£¥]|[a-zA-Z]{3,6})?/g;

  for (const match of text.matchAll(pattern)) {
    const rawNumber = match[2];
    if (!rawNumber) continue;

    const value = readNumber(rawNumber);
    if (value === null || value <= 0) continue;

    // A trailing word that is not a currency (as in "2 tickets") is left where
    // it is rather than mistaken for one, and is not consumed either.
    const symbolBefore = match[1];
    const wordAfter = match[3];
    const currency = currencyFor(symbolBefore ?? wordAfter ?? "");
    const consumed = currency || !wordAfter ? match[0] : match[0].slice(0, -wordAfter.length);

    return { amount: value, currency, matched: consumed };
  }

  return { amount: null, currency: null, matched: null };
}

/** Look for a currency named anywhere, for sentences like "paid in dollars". */
export function findCurrencyAnywhere(text: string): string | null {
  for (const word of text.toLowerCase().split(/[^a-z€$£¥]+/)) {
    const code = currencyFor(word);
    if (code) return code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// Checked in order, so the more specific categories win. "Flight to Berlin"
// should be Travel even though "ticket" would also look like Transport.
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: CategoryName; words: readonly string[] }> = [
  { category: "Travel", words: ["flight", "flights", "hotel", "hostel", "airbnb", "booking.com", "holiday", "trip", "finnair", "norwegian", "ryanair", "easyjet"] },
  { category: "Health", words: ["pharmacy", "apteekki", "chemist", "doctor", "dentist", "dental", "medicine", "prescription", "physio", "hospital", "optician"] },
  { category: "Bills", words: ["bill", "bills", "electricity", "internet", "broadband", "water", "heating", "insurance", "elisa", "telia", "helen", "hsy"] },
  { category: "Entertainment", words: ["cinema", "movie", "film", "concert", "gig", "netflix", "spotify", "museum", "theatre", "theater", "festival", "finnkino"] },
  { category: "Groceries", words: ["groceries", "grocery", "supermarket", "lidl", "aldi", "prisma", "alepa", "k-market", "s-market", "milk", "bread", "vegetables"] },
  { category: "Restaurants", words: ["restaurant", "lunch", "dinner", "breakfast", "brunch", "coffee", "cafe", "café", "pizza", "sushi", "burger", "takeaway", "pub", "beer", "wine", "kebab"] },
  { category: "Transport", words: ["taxi", "uber", "bolt", "train", "bus", "tram", "metro", "ticket", "fuel", "petrol", "diesel", "parking", "hsl", "neste"] },
  { category: "Shopping", words: ["clothes", "shoes", "jacket", "shirt", "jeans", "amazon", "ikea", "headphones", "laptop", "phone", "book", "books", "furniture"] },
];

/** Every category keyword, for the merchant step to avoid claiming one. */
const CATEGORY_WORDS = new Set(CATEGORY_KEYWORDS.flatMap((entry) => entry.words));

/**
 * Categories are read from the whole sentence rather than from what is left.
 *
 * A category is not a span of text that belongs to one field — it is a property
 * of the sentence as a whole, and its keyword is usually a word another step has
 * already claimed. "Coffee at k market" is a Restaurants expense whether or not
 * "coffee" ends up in the merchant name.
 */
export function findCategory(text: string): { category: CategoryName; matched: boolean } {
  const lower = text.toLowerCase();

  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.words.some((word) => lower.includes(word))) {
      return { category: entry.category, matched: true };
    }
  }

  return { category: "Other", matched: false };
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

const MERCHANT_PREPOSITIONS = new Set(["at", "from", "in", "on"]);
const MERCHANT_LEADING_WORDS = new Set(["the", "a", "an", "my"]);

/**
 * Words that end a name because of what they do in the *sentence*: articles,
 * conjunctions, prepositions, and the verbs people start with.
 *
 * Deliberately short. It no longer lists weekday or month names, because those
 * are consumed by the date step when they are functioning as a date — and when
 * they are not, "monday market" is a shop. It no longer rejects digits or
 * currency words at all, because by the time this runs, any digits belonging to
 * an amount and any currency beside one have already been taken away. A step
 * that re-checks what an earlier step already claimed is how the last round of
 * bugs happened.
 */
const MERCHANT_STOP_WORDS = new Set([
  "a", "an", "the", "my", "this", "that", "it", "and", "or", "for", "with", "of", "to",
  "at", "from", "in", "on",
  "i", "spent", "paid", "bought", "got", "cost", "costs", "about", "around", "roughly", "just", "now",
  "today", "yesterday", "tomorrow", "last", "next", "ago",
  "day", "days", "week", "weeks", "month", "months", "year", "years",
]);

/** Trim punctuation from the ends of a word, keeping it inside names like K-Market. */
function bareWord(word: string): string {
  return word.replace(/^[^A-Za-zÀ-ÿ0-9&]+/, "").replace(/[^A-Za-zÀ-ÿ0-9&.-]+$/, "");
}

/** Add capitals without ever removing them: "k market" becomes "K Market", IKEA stays IKEA. */
function capitaliseWords(text: string): string {
  return text.replace(
    /(^|[\s\-&])([a-zà-ÿ])/g,
    (_match, before: string, letter: string) => before + letter.toUpperCase(),
  );
}

function isNameWord(word: string, started: boolean): "take" | "skip" | "stop" {
  if (!word) return "stop";
  const lower = word.toLowerCase();
  // An article before the name belongs to the sentence, not to the shop.
  if (!started && MERCHANT_LEADING_WORDS.has(lower)) return "skip";
  if (MERCHANT_STOP_WORDS.has(lower)) return "stop";
  return "take";
}

/**
 * Decide whether the collected words are actually a name.
 *
 * Two things are not names however they were collected, and both are checked on
 * the finished result rather than word by word — which is what lets "euro shop"
 * and "7 eleven" through while still refusing "dollars":
 *
 *   - a single word that is exactly a currency ("paid 20 in dollars")
 *   - anything with no letters in it at all
 */
function acceptName(collected: string[]): string | null {
  if (collected.length === 0) return null;
  if (collected.length === 1 && currencyFor(collected[0] ?? "")) return null;
  const joined = collected.join(" ");
  if (!/[A-Za-zÀ-ÿ]/.test(joined)) return null;
  return joined;
}

/**
 * Guess a shop name from the words no other step claimed.
 *
 * Three tiers, strongest evidence first:
 *
 *   1. After a preposition. "at", "from", "in" and "on" are followed by the
 *      thing paid, which is the clearest signal a sentence offers. Up to four
 *      words.
 *   2. At the start of what is left. With the date and the amount removed,
 *      leading leftover words are usually the name — "mustafa doner 20 euros"
 *      leaves "mustafa doner". Capped at two words and requiring at least two,
 *      because without a preposition the evidence is weaker: one leftover word
 *      is far more often the item bought than the shop.
 *   3. A capitalised word. Only reached when the first two find nothing, and a
 *      hint rather than a requirement — capitalisation is never needed by tiers
 *      1 and 2.
 */
export type MerchantFinding = {
  name: string | null;
  /** The words used, so the caller can remove them before looking for a stray currency. */
  words: string[];
};

export function findMerchant(text: string): MerchantFinding {
  const words = text.trim().split(/\s+/).filter(Boolean);

  // Tier 1 — anchored on a preposition.
  for (let i = 0; i < words.length; i += 1) {
    if (!MERCHANT_PREPOSITIONS.has(bareWord(words[i] ?? "").toLowerCase())) continue;

    const collected: string[] = [];
    for (let j = i + 1; j < words.length && collected.length < 4; j += 1) {
      const raw = words[j] ?? "";
      const word = bareWord(raw);
      const verdict = isNameWord(word, collected.length > 0);
      if (verdict === "stop") break;
      if (verdict === "skip") continue;
      collected.push(word);
      if (/[,.;:]$/.test(raw)) break;
    }

    const name = acceptName(collected);
    if (name) return { name: capitaliseWords(name), words: collected };
  }

  // Tier 2 — the leftover words at the start. Capped at two and requiring two,
  // because without a preposition the evidence is weaker: one leftover word is
  // far more often the thing bought than the shop.
  const leading: string[] = [];
  for (const raw of words) {
    if (leading.length >= 2) break;
    const word = bareWord(raw);
    const verdict = isNameWord(word, leading.length > 0);
    if (verdict === "stop") break;
    if (verdict === "skip") continue;
    // A category keyword describes what was bought, not where.
    if (CATEGORY_WORDS.has(word.toLowerCase())) break;
    leading.push(word);
  }
  if (leading.length >= 2) {
    const name = acceptName(leading);
    if (name) return { name: capitaliseWords(name), words: leading };
  }

  // Tier 3 — a capital letter, as a last hint rather than a requirement.
  for (let i = 1; i < words.length; i += 1) {
    const word = bareWord(words[i] ?? "");
    if (word.length < 2) continue;
    if (!/^[A-ZÀ-Þ]/.test(word)) continue;
    if (MERCHANT_STOP_WORDS.has(word.toLowerCase())) continue;
    if (currencyFor(word)) continue;
    return { name: word, words: [word] };
  }

  return { name: null, words: [] };
}

/** Remove the first occurrence of a fragment, leaving a space so words do not merge. */
export function removeFirst(text: string, fragment: string | null): string {
  if (!fragment) return text;
  const index = text.indexOf(fragment);
  if (index < 0) return text;
  return `${text.slice(0, index)} ${text.slice(index + fragment.length)}`;
}
