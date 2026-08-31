import type { CategoryName } from "../lib/categories.js";
import { addDays } from "../lib/dates.js";
import type {
  ExpenseParser,
  MonthlySummaryRequest,
  ParseRequest,
  ParseResult,
} from "./types.js";

/**
 * The offline parser. No network, no API key, no cost.
 *
 * It is deliberately imperfect: regular expressions and keyword lists, not
 * understanding. That is the point — it proves the confirm step earns its place,
 * and it means the whole app runs for anyone who clones the repository with
 * nothing configured.
 */

// Symbols, codes and words that name a currency, mapped to the code we store.
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

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Capitalised words that are never a shop name.
const NOT_A_MERCHANT = new Set([
  "I", "Spent", "Paid", "Bought", "Got", "Today", "Yesterday", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February",
  "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December", "The", "A", "An", "My", "Last", "This", "It",
]);

/**
 * Look a word up in the currency table.
 *
 * `CURRENCY_WORDS[word]` on its own would be a bug waiting to happen: plain
 * objects inherit properties like `constructor` and `toString`, so a sentence
 * containing one of those words would come back holding a function instead of a
 * currency code. `Object.hasOwn` asks whether the table itself has the key.
 */
function currencyFor(word: string): string | null {
  const key = word.toLowerCase();
  return Object.hasOwn(CURRENCY_WORDS, key) ? (CURRENCY_WORDS[key] ?? null) : null;
}

/**
 * Find the amount and, if it was written with a symbol or a currency word, the
 * currency too.
 *
 * European writing uses a comma for the decimal point ("12,50"), so a comma
 * followed by exactly two digits is treated as a decimal point and any other
 * comma as a thousands separator.
 */
function findAmount(text: string): { amount: number | null; currency: string | null } {
  const pattern = /([€$£¥])?\s*([0-9]+(?:[.,][0-9]+)?)\s*([€$£¥]|[a-zA-Z]{3,6})?/g;

  for (const match of text.matchAll(pattern)) {
    const symbolBefore = match[1];
    const rawNumber = match[2];
    const wordAfter = match[3];

    if (!rawNumber) continue;

    // "12,50" is twelve euros fifty; "1,200" is one thousand two hundred.
    const commaIsDecimal = /,[0-9]{2}$/.test(rawNumber);
    const normalised = commaIsDecimal
      ? rawNumber.replace(",", ".")
      : rawNumber.replace(/,/g, "");

    const value = Number(normalised);
    if (!Number.isFinite(value) || value <= 0) continue;

    // A trailing word that is not a currency (as in "2 tickets") is ignored
    // rather than mistaken for one.
    const marker = symbolBefore ?? wordAfter;
    const currency = marker ? currencyFor(marker) : null;

    return { amount: value, currency };
  }

  return { amount: null, currency: null };
}

/** Look for a currency named anywhere, for sentences like "paid in dollars". */
function findCurrencyAnywhere(text: string): string | null {
  for (const word of text.toLowerCase().split(/[^a-z€$£¥]+/)) {
    const code = currencyFor(word);
    if (code) return code;
  }
  return null;
}

function findCategory(text: string): { category: CategoryName; matched: boolean } {
  const lower = text.toLowerCase();

  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.words.some((word) => lower.includes(word))) {
      return { category: entry.category, matched: true };
    }
  }

  // Nothing recognised. "Other" is honest, and the low confidence that comes
  // with it is what tells the person to look closely.
  return { category: "Other", matched: false };
}

/**
 * Guess a shop name from capitalised words. "at Lidl" and "from K-Market" are
 * the strongest signals; otherwise any capitalised word that is not the first
 * word of the sentence and not a day, month or common verb.
 */
function isPlausibleMerchant(word: string): boolean {
  if (word.length < 2) return false;
  if (NOT_A_MERCHANT.has(word)) return false;
  // "paid 89.99 USD on Amazon" should not decide the shop was called USD.
  if (currencyFor(word)) return false;
  return true;
}

function findMerchant(sentence: string): string | null {
  const afterPreposition = sentence.match(
    /\b(?:at|from|in|on)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*){0,2})/,
  );
  const candidate = afterPreposition?.[1]?.trim();
  if (candidate && isPlausibleMerchant(candidate.split(/\s+/)[0] ?? "")) {
    return candidate;
  }

  const words = sentence.split(/\s+/);
  for (let i = 1; i < words.length; i += 1) {
    const word = (words[i] ?? "").replace(/[^\w&.-]/g, "");
    if (/^[A-Z]/.test(word) && isPlausibleMerchant(word)) return word;
  }

  return null;
}

/** Read simple date phrases. Anything it does not recognise means today. */
function findDate(text: string, today: string): { date: string; explicit: boolean } {
  const lower = text.toLowerCase();

  const written = lower.match(/\b([0-9]{4}-[0-9]{2}-[0-9]{2})\b/);
  if (written?.[1]) return { date: written[1], explicit: true };

  if (lower.includes("day before yesterday")) return { date: addDays(today, -2), explicit: true };
  if (lower.includes("yesterday")) return { date: addDays(today, -1), explicit: true };
  if (lower.includes("today") || lower.includes("just now")) return { date: today, explicit: true };
  if (lower.includes("last week")) return { date: addDays(today, -7), explicit: true };

  const daysAgo = lower.match(/\b([0-9]{1,3})\s+days?\s+ago\b/);
  if (daysAgo?.[1]) return { date: addDays(today, -Number(daysAgo[1])), explicit: true };

  const weekday = lower.match(
    /\b(?:last|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekday?.[1]) {
    const wanted = WEEKDAYS.indexOf(weekday[1]);
    const [year, month, day] = today.split("-").map(Number);
    const current = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    // How many days back the most recent one of that weekday was. The result is
    // 1 to 7 rather than 0 to 6, so "last Monday" on a Monday means the
    // previous week rather than today.
    const back = ((current - wanted + 6) % 7) + 1;
    return { date: addDays(today, -back), explicit: true };
  }

  return { date: today, explicit: false };
}

export const mockParser: ExpenseParser = {
  name: "mock",

  async parseExpense({ sentence, today }: ParseRequest): Promise<ParseResult> {
    const trimmed = sentence.trim();

    const { amount, currency: currencyFromAmount } = findAmount(trimmed);
    const currency = currencyFromAmount ?? findCurrencyAnywhere(trimmed) ?? "EUR";
    const { category, matched } = findCategory(trimmed);
    const merchant = findMerchant(trimmed);
    const { date, explicit } = findDate(trimmed, today);

    // Confidence is a rough tally of how much was actually recognised rather
    // than assumed. It is capped below 1 on purpose: this parser is never
    // certain, and a number that reads as "definitely" would quietly undermine
    // the confirm step it exists to justify.
    let confidence = 0.3;
    if (amount !== null) confidence += 0.25;
    if (currencyFromAmount) confidence += 0.1;
    if (matched) confidence += 0.15;
    if (merchant) confidence += 0.1;
    if (explicit) confidence += 0.1;

    return {
      suggestion: {
        amount,
        currency,
        merchant,
        category,
        // The original sentence is kept as the description, so nothing the
        // person typed is lost between typing and confirming.
        description: trimmed.slice(0, 500),
        expenseDate: date,
      },
      confidence: Math.min(Math.round(confidence * 100) / 100, 0.95),
      producedBy: "mock",
    };
  },

  async summarizeMonth(request: MonthlySummaryRequest): Promise<string> {
    const { month, totalEur, expenseCount, byCategory, previousMonthTotalEur } = request;

    if (expenseCount === 0) return `No expenses recorded in ${month}.`;

    const ranked = [...byCategory].sort((a, b) => b.totalEur - a.totalEur);
    const biggest = ranked[0];
    const sentences: string[] = [
      `In ${month} you spent €${totalEur.toFixed(2)} across ${expenseCount} expenses.`,
    ];

    if (biggest) {
      const share = totalEur > 0 ? Math.round((biggest.totalEur / totalEur) * 100) : 0;
      sentences.push(
        `${biggest.category} was the largest category at €${biggest.totalEur.toFixed(2)}, about ${share}% of the total.`,
      );
    }

    if (previousMonthTotalEur !== null && previousMonthTotalEur > 0) {
      const difference = totalEur - previousMonthTotalEur;
      const percent = Math.abs(Math.round((difference / previousMonthTotalEur) * 100));
      sentences.push(
        difference >= 0
          ? `That is ${percent}% more than the month before.`
          : `That is ${percent}% less than the month before.`,
      );
    }

    return sentences.join(" ");
  },
};
