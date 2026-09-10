import type { CategoryName } from "../lib/categories.js";
import { addDays } from "../lib/dates.js";
import { MONTH_NAME_PATTERN, monthFromName, needsADayBeside } from "./month-names.js";

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
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const built = new Date(Date.UTC(year, month - 1, day));
  return (
    built.getUTCFullYear() === year &&
    built.getUTCMonth() === month - 1 &&
    built.getUTCDate() === day
  );
}

export type DateFinding =
  /** A date was read. */
  | { kind: "found"; date: string; matched: string }
  /**
   * Something in the sentence was clearly meant to be a date and could not be
   * turned into one. This is a separate outcome from "no date", and the whole
   * reason it exists: falling back to today here would produce a wrong date that
   * looks exactly like a deliberate one.
   */
  | { kind: "unreadable"; matched: string; problem: string }
  /** The sentence mentioned no date. Today is the right default, quietly. */
  | { kind: "none" };

/**
 * The year to assume when a date names a day and a month but no year.
 *
 * **The most recent occurrence on or before today.** "sept 4" typed in October
 * 2026 is 4 September 2026; the same words typed in August 2026 are 4 September
 * *2025*, because September 2026 has not happened yet. People writing an expense
 * are recording something they have already spent, so the reading that puts the
 * date in the past is the one they meant — and the alternative produces a date
 * the rest of the app refuses anyway, since nothing here accepts the future.
 *
 * Walking backwards a year at a time rather than doing arithmetic is what makes
 * "29 february" work: it simply keeps going until it finds a year where that day
 * existed, which is the most recent leap year. Eight years is far more than any
 * of this needs and still terminates on a day that never exists — 31 February
 * finds nothing and is reported as unreadable.
 */
export function mostRecentOccurrence(month: number, day: number, today: string): string | null {
  const thisYear = Number(today.slice(0, 4));

  for (let year = thisYear; year >= thisYear - 8; year -= 1) {
    if (!isRealDate(year, month, day)) continue;
    const value = `${year}-${pad(month)}-${pad(day)}`;
    if (value <= today) return value;
  }

  return null;
}

/**
 * The part of a match worth quoting back at a person.
 *
 * The match deliberately includes a leading preposition so that "on" is removed
 * along with the date — left behind, it is a word the merchant step anchors
 * names to. But a message reading “on 31 february” is not a real date quotes a
 * word the person did not get wrong, so the preposition is trimmed here, where
 * the text is being read rather than removed.
 */
function quotable(matched: string): string {
  return matched.trim().replace(/^(?:on|in|the|of)\s+/i, "").trim();
}

/**
 * Turn a day, a month and possibly a year into a finding.
 *
 * The three outcomes are the point. A date that is impossible and a date that
 * has not happened yet are both *unreadable* rather than ignored, because both
 * were unmistakably meant to be dates.
 */
function resolve(
  matched: string,
  day: number,
  month: number,
  writtenYear: number | null,
  today: string,
): DateFinding {
  if (writtenYear === null) {
    const date = mostRecentOccurrence(month, day, today);
    return date === null
      ? { kind: "unreadable", matched, problem: `“${quotable(matched)}” is not a real date.` }
      : { kind: "found", date, matched };
  }

  if (!isRealDate(writtenYear, month, day)) {
    return { kind: "unreadable", matched, problem: `“${quotable(matched)}” is not a real date.` };
  }

  const date = `${writtenYear}-${pad(month)}-${pad(day)}`;
  return date <= today
    ? { kind: "found", date, matched }
    : { kind: "unreadable", matched, problem: `“${quotable(matched)}” is in the future.` };
}

/** Two digits mean this century. The only reading that makes sense for spending. */
function fullYear(written: string | undefined): number | null {
  if (!written) return null;
  const value = Number(written);
  return written.length === 2 ? 2000 + value : value;
}

// A day, with an English ordinal suffix or a Finnish full stop, both optional.
const DAY = String.raw`([0-9]{1,2})(?:st|nd|rd|th)?\.?`;
// A month name, with an optional abbreviating full stop.
const MONTH = `(${MONTH_NAME_PATTERN})\\.?`;
const YEAR = String.raw`([0-9]{4}|[0-9]{2})`;

/**
 * Day first: "4 sept", "4th September 2026", "4. syyskuuta", "on the 4th of May".
 *
 * The leading preposition is part of the match so that it is removed with the
 * date. Left behind, "on" is a word the merchant step anchors names to, and
 * "at uniqlo on sept 4" would have looked to it like a shop called "4".
 */
const DAY_FIRST = new RegExp(
  String.raw`\b(?:on\s+)?(?:the\s+)?${DAY}\s+(?:of\s+)?${MONTH}(?:\s*,?\s+${YEAR})?\b`,
  "i",
);

/** Month first: "sept 4", "September 4th", "Sep 4, 2026", "syyskuun 4.". */
const MONTH_FIRST = new RegExp(
  String.raw`\b(?:on\s+)?${MONTH}\s+${DAY}(?:\s*,?\s+${YEAR})?\b`,
  "i",
);

/** A month named with no day anywhere beside it: "in september", "syyskuussa". */
const MONTH_ALONE = new RegExp(String.raw`\b(?:in\s+)?(${MONTH_NAME_PATTERN})\.?\b`, "i");

/**
 * Find a date.
 *
 * The written forms understood, in the order they are tried:
 *
 *   - ISO, `2026-07-14`. Unambiguous: a four-digit leading group cannot be a day.
 *   - Day first and numeric, `31.8.2026`, `31.08.26`, `31,08,26`, `31/8/26`. The
 *     Finnish convention and the one a Finnish user will actually type. The
 *     separator may be a dot, a comma, a slash or a hyphen, but it must be the
 *     *same* one both times, so "31.08,26" is not a date.
 *   - Day first with a month name, `4 sept`, `4th September 2026`,
 *     `4. syyskuuta`, `on the 4th of May`.
 *   - Month first with a month name, `sept 4`, `September 4th`, `Sep 4, 2026`.
 *   - Relative phrases, `yesterday`, `3 days ago`, `last friday`.
 *   - A month named with no day: not a date, but plainly an attempt at one.
 *
 * Month names are English or Finnish, full or abbreviated, and Finnish takes any
 * of the endings a date uses. See month-names.ts.
 *
 * WHAT HAPPENS WHEN IT CANNOT READ ONE
 * ------------------------------------
 * It says so, rather than quietly returning today. That distinction is the point
 * of this function's three outcomes and is worth stating plainly: a sentence
 * with no date in it is an ordinary thing and today is the right answer, but a
 * sentence that clearly *tried* to say a date and failed must not be answered
 * with a date that looks just as deliberate as a correct one. The confirm step
 * shows the date either way, and a wrong date that looks deliberate is the one
 * thing a person checking a screen full of plausible values will miss.
 */
export function findDate(text: string, today: string): DateFinding {
  const iso = text.match(/\b([0-9]{4})-([0-9]{2})-([0-9]{2})\b/);
  if (iso) {
    const [matched, y, m, d] = iso;
    return resolve(matched, Number(d), Number(m), Number(y), today);
  }

  // Day first. The backreference forces the same separator in both places.
  const written = text.match(/\b([0-9]{1,2})([.,/-])([0-9]{1,2})\2([0-9]{4}|[0-9]{2})\b/);
  if (written) {
    const [matched, d, , m, y] = written;
    const day = Number(d);
    const month = Number(m);
    // Only treated as a date at all when the numbers are in range for one.
    // "45,99,26" is not a misspelt date, it is a grouped number, and claiming
    // otherwise would refuse an amount somebody typed correctly. A date-shaped
    // triple that fails only on the calendar — "31,02,26" — is a different
    // matter, and is reported rather than ignored.
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return resolve(matched, day, month, fullYear(y), today);
    }
  }

  for (const pattern of [DAY_FIRST, MONTH_FIRST]) {
    const match = text.match(pattern);
    if (!match) continue;

    const dayFirst = pattern === DAY_FIRST;
    const day = Number(dayFirst ? match[1] : match[2]);
    const name = (dayFirst ? match[2] : match[1]) ?? "";
    const month = monthFromName(name);
    if (month === null) continue;

    return resolve(match[0], day, month, fullYear(match[3]), today);
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

  for (const { pattern, resolve: toDate } of phrases) {
    const match = text.match(pattern);
    if (match) return { kind: "found", date: toDate(match), matched: match[0] };
  }

  // A month with no day beside it. Not a date — a month is a period, not a day —
  // but unmistakably an attempt at one, so it is reported rather than ignored.
  // "may" is excluded: it is a common English verb, and treating every sentence
  // containing it as a failed date would be worse than the problem.
  const alone = text.match(MONTH_ALONE);
  if (alone && !needsADayBeside(alone[1] ?? "")) {
    return {
      kind: "unreadable",
      matched: alone[0],
      problem: `“${(alone[1] ?? "").trim()}” names a month but not a day.`,
    };
  }

  return { kind: "none" };
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

/**
 * The words that name a category, split into two kinds.
 *
 * THE DISTINCTION THAT MATTERS
 * ----------------------------
 * These used to be one list, and that conflation was a bug waiting to be
 * reported. "coffee" and "netflix" are both evidence of a category, but they are
 * completely different kinds of word:
 *
 *   items  — common nouns. They say *what was bought*. "coffee", "dentist",
 *            "cinema", "clothes". A sentence containing one is not naming a shop.
 *   brands — proper names. They say what was bought *and where*, because the
 *            company is the merchant. "netflix", "lidl", "ikea", "finnair".
 *
 * The merchant step needs to tell them apart. With one list it could only refuse
 * all of them, which is why "32 euro netflix sept 5" came back with no merchant:
 * "netflix" was rejected as a category word, and there was no preposition to
 * rescue it. With two, an item word says "this is not a name" and a brand word
 * says "this is one".
 *
 * Checked in order, so the more specific categories win. "Flight to Berlin"
 * should be Travel even though "ticket" would also look like Transport.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{
  category: CategoryName;
  items: readonly string[];
  brands: readonly string[];
}> = [
  {
    category: "Travel",
    items: ["flight", "flights", "hotel", "hostel", "holiday", "trip"],
    brands: ["airbnb", "booking.com", "finnair", "norwegian", "ryanair", "easyjet"],
  },
  {
    category: "Health",
    items: ["pharmacy", "apteekki", "chemist", "doctor", "dentist", "dental", "medicine", "prescription", "physio", "hospital", "optician"],
    brands: [],
  },
  {
    category: "Bills",
    items: ["bill", "bills", "electricity", "internet", "broadband", "water", "heating", "insurance"],
    brands: ["elisa", "telia", "helen", "hsy"],
  },
  {
    category: "Entertainment",
    items: ["cinema", "movie", "film", "concert", "gig", "museum", "theatre", "theater", "festival"],
    brands: ["netflix", "spotify", "finnkino"],
  },
  {
    category: "Groceries",
    items: ["groceries", "grocery", "supermarket", "milk", "bread", "vegetables"],
    brands: ["lidl", "aldi", "prisma", "alepa", "k-market", "s-market"],
  },
  {
    category: "Restaurants",
    items: ["restaurant", "lunch", "dinner", "breakfast", "brunch", "coffee", "cafe", "café", "pizza", "sushi", "burger", "takeaway", "pub", "beer", "wine", "kebab"],
    brands: ["kotipizza", "hesburger"],
  },
  {
    category: "Transport",
    items: ["taxi", "train", "bus", "tram", "metro", "ticket", "fuel", "petrol", "diesel", "parking"],
    brands: ["uber", "bolt", "hsl", "neste"],
  },
  {
    category: "Shopping",
    items: ["clothes", "shoes", "jacket", "shirt", "jeans", "headphones", "laptop", "phone", "book", "books", "furniture"],
    brands: ["amazon", "ikea"],
  },
];

/**
 * Common nouns: a word that says what was bought, and so is never a shop name.
 *
 * This is the only list the merchant step consults, and it consults it as a
 * *negative* — "this word is a thing, not a place". It is not a list of the ways
 * a merchant can look, which is the trap the preposition rule fell into.
 */
const ITEM_WORDS = new Set(CATEGORY_KEYWORDS.flatMap((entry) => entry.items));

/**
 * Proper names: the shop is the word.
 *
 * Evidence, never a requirement. A name that is not in here is still found by
 * everything else — a preposition pointing at it, a capital letter, or simply
 * being what is left once every other step has taken its share. The list exists
 * so that a lowercase, unmarked, unremarkable "netflix" sitting alone in the
 * middle of a sentence can still be recognised, which is the one case nothing
 * structural can settle.
 */
const BRAND_WORDS = new Set(CATEGORY_KEYWORDS.flatMap((entry) => entry.brands));

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
    if ([...entry.items, ...entry.brands].some((word) => lower.includes(word))) {
      return { category: entry.category, matched: true };
    }
  }

  return { category: "Other", matched: false };
}

// ---------------------------------------------------------------------------
// Merchants
// ---------------------------------------------------------------------------

/**
 * Prepositions that separate what was bought from where it was bought.
 *
 * These no longer *gate* the merchant step — they split it. Requiring one was a
 * whitelist of the ways a name can appear in a sentence, and there is always
 * another way: "32 euro netflix sept 5" has a shop name sitting between the
 * amount and the date with nothing marking it at all. The same shape of mistake
 * as the query box only answering questions whose wording it had anticipated.
 *
 * What they are still good for is the boundary. When one is present, everything
 * before it is what was bought and everything after it is where — "coffee and
 * tea at k market" splits cleanly and no guessing is needed.
 */
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
 * Whether one word, standing alone, is a name rather than a thing.
 *
 * Asked only when a single word is all that is left and there is no preposition
 * pointing at it — "32 euro netflix sept 5" leaves exactly "netflix". Three
 * answers in order of confidence:
 *
 *   - a known brand is a name, because the company is the shop
 *   - a known common noun is not, because it says what was bought
 *   - anything else is judged by its capital letter, which is the only signal
 *     an unknown word carries
 *
 * The last of those is why "32 euro kotipizza" written in lowercase, for a shop
 * nothing here has heard of, comes back with no merchant. That is not a gap to
 * be filled with a longer list: one unremarkable lowercase word is genuinely
 * ambiguous — "32 euro chocolate" has the identical shape — and the confirm step
 * is where a person settles what a rule cannot.
 */
function standsAloneAsAName(word: string): boolean {
  const lower = word.toLowerCase();
  if (BRAND_WORDS.has(lower)) return true;
  if (ITEM_WORDS.has(lower)) return false;
  return /^[A-ZÀ-Þ]/.test(word);
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
 * How many words a name can run to when nothing marks where it ends.
 *
 * After a preposition there is a marker, so four is safe. Without one there is
 * nothing at all saying where the name stops and the description starts, and two
 * is the length at which guessing is still usually right: "mustafa doner",
 * "k market", "s market". "s market chocolate" gives up "chocolate", which is
 * the correct trade — a name with a stray word on the end is worse than a name
 * with a word missing from the description, because only one of the two is shown
 * as a heading.
 */
const MAX_UNMARKED_NAME_WORDS = 2;

/**
 * What is left over, once every other step has taken its share.
 *
 * THE INVERSION
 * -------------
 * This used to ask "does this sentence contain one of the four shapes I know a
 * merchant can take?" — after a preposition, two words at the start, or a
 * capital letter. That is a whitelist of phrasings, and a whitelist of phrasings
 * can always be walked around: "32 euro netflix sept 5" fits none of them and
 * has an obvious merchant in it.
 *
 * It now asks the opposite question. The amount, the currency and the date have
 * been identified and removed, and the words that say what was *bought* are
 * known from the category table. Whatever survives all of that is the name.
 * There is no list of phrasings to outflank, because there is no list — the
 * sentence is being reduced rather than matched.
 *
 * SPLITTING WHAT IS LEFT
 * ----------------------
 * The leftover can hold a name, a description, or both, and the rules for
 * telling them apart are these, in order:
 *
 *   1. A preposition, if there is one, is the boundary. Before it is what was
 *      bought; after it is where. "coffee and tea at k market" needs no guessing.
 *   2. With no preposition, the leading run of leftover words is the name, up to
 *      two, stopping at any word that says what was bought. "s market chocolate"
 *      gives "S Market"; "cinema tickets" gives nothing, because it opens with a
 *      thing rather than a place.
 *   3. A single leftover word is a name only if it looks like one on its own —
 *      a brand, or a capital letter. "netflix" yes, "coffee" no.
 *   4. Failing all of that, any capitalised leftover word anywhere. A capital in
 *      the middle of a sentence is somebody typing a proper noun.
 *
 * The description needs no rule of its own, because `description` keeps the
 * whole sentence exactly as it was typed — an earlier decision, so that nothing
 * a person wrote is lost between typing and confirming. The split above decides
 * what is promoted to a name; everything else stays where it already is.
 */
export type MerchantFinding = {
  name: string | null;
  /** The words used, so the caller can remove them before looking for a stray currency. */
  words: string[];
};

export function findMerchant(text: string): MerchantFinding {
  const words = text.trim().split(/\s+/).filter(Boolean);

  // 1. A preposition marks the boundary. Item words are deliberately *not*
  //    checked here: "at cafe regatta" is a shop whose name happens to start
  //    with a word that also names a category, and the preposition is stronger
  //    evidence than the word list.
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

  // 2 and 3. No preposition, so the leftover speaks for itself.
  const leading: string[] = [];
  for (const raw of words) {
    if (leading.length >= MAX_UNMARKED_NAME_WORDS) break;
    const word = bareWord(raw);
    const verdict = isNameWord(word, leading.length > 0);
    if (verdict === "stop") break;
    if (verdict === "skip") continue;
    // A word that says what was bought ends the name rather than joining it.
    // A brand does not: it says what was bought *and* where.
    if (ITEM_WORDS.has(word.toLowerCase())) break;
    leading.push(word);
    // A brand is a complete name by itself, so the name ends with it rather than
    // running on: "89 eur ikea shelves" is Ikea, and the shelves are what was
    // bought there. Without this the two-word run would swallow both.
    if (BRAND_WORDS.has(word.toLowerCase())) break;
  }

  const enoughOnItsOwn =
    leading.length >= 2 || (leading.length === 1 && standsAloneAsAName(leading[0] ?? ""));

  if (enoughOnItsOwn) {
    const name = acceptName(leading);
    if (name) return { name: capitaliseWords(name), words: leading };
  }

  // 4. A capital letter anywhere in what is left.
  //
  // This used to skip the first word, to avoid claiming the capital that begins
  // a sentence. Asking whether the word is a *thing* is the better question and
  // does not depend on where it sits: "Coffee 4 eur" is refused because coffee
  // is something you buy, not because of its position, and a name that happens
  // to open the leftover is no longer missed.
  for (const raw of words) {
    const word = bareWord(raw);
    if (word.length < 2) continue;
    if (!/^[A-ZÀ-Þ]/.test(word)) continue;
    if (MERCHANT_STOP_WORDS.has(word.toLowerCase())) continue;
    if (ITEM_WORDS.has(word.toLowerCase())) continue;
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
