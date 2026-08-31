import { addDays, startOfMonth, startOfWeek } from "../lib/dates.js";
import type { AskRequest, StructuredQuestion } from "./types.js";

/**
 * The offline question parser: regular expressions and word lists, no network.
 *
 * It is narrow on purpose and honest about it. What matters far more than its
 * coverage is its failure: anything it cannot express becomes `unsupported`
 * rather than a query that quietly drops a constraint. With `AI_PROVIDER=mock` —
 * the default, and the state anyone gets by cloning this repository — the
 * refusal path is therefore the ordinary experience rather than an edge case
 * that only appears when somebody has a key.
 *
 * **The rule this file is built around: never silently drop a constraint.**
 * Answering the wider question produces a correct figure that answers nothing
 * that was asked, which is the worst outcome this feature has available to it.
 *
 * That rule is enforced in exactly one place — `unreadWords` below, checked once
 * before any query shape is chosen. It used to be enforced by three guards keyed
 * on prepositions ("at X", "on X"), and that was the wrong shape: a noun narrows
 * a question perfectly well without one. "Lowest food expense" walked past all
 * three and came back with the lowest expense overall. A blacklist of the ways a
 * constraint can appear will always be missing one; the whitelist below has to
 * account for every word instead.
 */

const QUESTION_WORDS =
  /\b(what|which|when|where|who|how|why|highest|biggest|largest|most|expensive|lowest|smallest|least|cheapest|average|mean|total|busiest|top|show|list|many|much)\b|\?/i;

const HIGHEST = /\b(highest|biggest|largest|most|expensive|top|busiest|max)\b/i;
const LOWEST = /\b(lowest|smallest|least|cheapest|min)\b/i;

const COUNT = /\b(how many|number of|count|busiest)\b/i;
const AVERAGE = /\b(average|mean|typical)\b/i;

/**
 * Questions this feature does not answer, checked before anything else.
 *
 * Without this, "why did I spend so much on food" reaches the totals rule —
 * "spend" is in it — and comes back with a real figure for the whole period. A
 * number in answer to "why" is the worst thing this could produce: it looks like
 * an answer, and it is not one.
 *
 * Comparison lives here too. "More on food than transport" is two aggregates and
 * a subtraction, which the grammar deliberately does not express, so it is
 * declined rather than half-answered.
 */
const OUT_OF_SCOPE =
  /\b(why|should|shall|ought|recommend|advice|advise|predict|forecast|budget|afford|will i|going to|next (?:month|week|year|quarter)|than|versus|vs|compared)\b/i;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/**
 * Every word these rules actually understand.
 *
 * A whitelist, not a blacklist. Anything in a question that is not one of these,
 * and was not consumed as a category, a shop or a date, is a constraint that was
 * not read — and the answer is a refusal naming it.
 *
 * Only structural words belong here: grammar, the vocabulary of the query shapes
 * themselves, and units of time. **No domain nouns.** Adding "food" to this list
 * would be exactly the bug it exists to prevent.
 */
const KNOWN_WORDS = new Set([
  // asking
  "what", "whats", "which", "when", "where", "who", "how", "show", "list", "tell",
  // grammar
  "a", "an", "the", "my", "mine", "me", "i", "we", "our", "is", "are", "was", "were",
  "do", "did", "does", "have", "has", "had", "be", "been", "of", "and", "or", "s",
  "this", "that", "these", "those", "it", "them", "there", "so", "far", "ever",
  "all", "any", "please", "just", "about",
  // prepositions the rules read
  "on", "in", "at", "for", "from", "to", "by", "during", "with", "over",
  // spending
  "spend", "spent", "spending", "spends", "cost", "costs", "paid", "pay", "buy", "bought",
  // the query shapes
  "highest", "biggest", "largest", "most", "expensive", "lowest", "smallest", "least",
  "cheapest", "top", "busiest", "max", "min", "average", "mean", "typical", "total",
  "totals", "count", "number", "many", "much",
  "expense", "expenses", "category", "categories", "shop", "shops", "store", "stores",
  "merchant", "merchants", "place", "places",
  // time the rules read
  "day", "days", "week", "weeks", "month", "months", "year", "years",
  "today", "yesterday",
  ...MONTHS,
]);

/** Something typed into the wrong box: a figure, with nothing asked. */
function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

function findCategory(text: string, categories: readonly string[]): string | null {
  // Longest first, so a two-word category wins over a one-word one that happens
  // to be a substring of it.
  const byLength = [...categories].sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  return byLength.find((name) => lower.includes(name.toLowerCase())) ?? null;
}

/** A shop named after "at" or "from", stopping where a new clause begins. */
function findMerchant(text: string): string | null {
  const match =
    /\b(?:at|from)\s+([\p{L}][\p{L}\p{N}'&.-]*(?:\s+[\p{L}][\p{L}\p{N}'&.-]*)?)(?=\s+(?:in|on|during|for|last|this|between|and)\b|[?.,!]|$)/iu.exec(
      text,
    );
  const name = match?.[1]?.trim();
  return name && name.length > 1 ? name : null;
}

/** The last day of the month a YYYY-MM-01 falls in. */
function endOfMonth(first: string): string {
  const [year, month] = first.split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

/** Only the period words the dropdown itself offers, plus a named month. */
function findWindow(text: string, today: string): { from: string; to: string } | null {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return { from: today, to: today };
  if (/\byesterday\b/.test(lower)) {
    const day = addDays(today, -1);
    return { from: day, to: day };
  }
  if (/\bthis week\b/.test(lower)) return { from: startOfWeek(today), to: today };
  if (/\bthis month\b/.test(lower)) return { from: startOfMonth(today), to: today };
  if (/\bthis year\b/.test(lower)) return { from: `${today.slice(0, 4)}-01-01`, to: today };

  const named = MONTHS.findIndex((month) => new RegExp(`\\b${month}\\b`).test(lower));
  if (named !== -1) {
    // A month that has not happened yet this year means the one that has:
    // "in December", asked in August, is last December.
    const thisYear = Number(today.slice(0, 4));
    const thisMonth = Number(today.slice(5, 7));
    const year = named + 1 > thisMonth ? thisYear - 1 : thisYear;
    const from = `${year}-${String(named + 1).padStart(2, "0")}-01`;
    return { from, to: endOfMonth(from) };
  }

  return null;
}

/**
 * The one place the never-drop-a-constraint rule is enforced.
 *
 * Everything the rules understood is removed — the matched category, the matched
 * shop, the grammar and query vocabulary, bare numbers — and whatever is still
 * standing was a constraint nobody read. There is no branch this can be missed
 * on, because it runs before a branch is chosen.
 */
export function unreadWords(
  text: string,
  matched: { category: string | null; merchant: string | null },
): string[] {
  let rest = ` ${text.toLowerCase()} `;

  for (const used of [matched.category, matched.merchant]) {
    if (!used) continue;
    // Each word of a multi-word match, so "The Breakfast Club" clears all three.
    for (const word of used.toLowerCase().split(/\s+/)) {
      rest = rest.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
    }
  }

  return rest
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((word) => !KNOWN_WORDS.has(word) && !/^\d+$/.test(word));
}

export function readQuestion(request: AskRequest): StructuredQuestion {
  const text = request.question.trim();
  const unsupported = (reason: string): StructuredQuestion => ({ kind: "unsupported", reason });

  // 1. A figure with nothing asked. Almost certainly meant for the add box.
  //
  //    A merchant is not required: "42 euros yesterday" is every bit as much an
  //    expense as "42 euros at Lidl", and insisting on a shop would miss the
  //    commonest version of the mistake.
  if (hasNumber(text) && !QUESTION_WORDS.test(text)) {
    return { kind: "looksLikeExpense" };
  }

  // 2. Outside the grammar, before any rule can find something to match on.
  //    "Why did I spend so much on food" contains "spend", and without this
  //    guard the totals rule would answer it with a real figure.
  if (OUT_OF_SCOPE.test(text)) {
    return unsupported(
      "I can only look up what was spent — not why, not what happens next, and not one thing against another.",
    );
  }

  if (!QUESTION_WORDS.test(text)) {
    return unsupported("That does not read as a question about your spending.");
  }

  const order = LOWEST.test(text) ? "lowest" : "highest";
  const measure = COUNT.test(text) ? "count" : AVERAGE.test(text) ? "average" : "total";

  const category = findCategory(text, request.categories);
  const merchant = findMerchant(text);
  const window = findWindow(text, request.today);

  // 3. Never silently drop a constraint. One check, before any shape is chosen,
  //    so there is no fourth branch for it to be forgotten on.
  const unread = unreadWords(text, { category, merchant });
  if (unread.length > 0) {
    const named = unread.map((word) => `"${word}"`).join(", ");
    return unsupported(
      `I do not know what ${named} means here, so I have not guessed. I can filter by category and by shop.`,
    );
  }

  const filters = {
    category,
    merchant,
    from: window?.from ?? null,
    to: window?.to ?? null,
  };

  // 4. Grouped into buckets, when the sentence names one.
  const bucket = /\bweeks?\b/i.test(text)
    ? "week"
    : /\bmonths?\b/i.test(text)
      ? "month"
      : /\bdays?\b/i.test(text) || /\bbusiest\b/i.test(text)
        ? "day"
        : /\bcategor/i.test(text)
          ? "category"
          : /\b(shops?|stores?|merchants?|places?)\b/i.test(text)
            ? "merchant"
            : null;

  if (bucket) {
    return { kind: "topBuckets", bucket, measure, order, limit: 1, filters };
  }

  // 5. Individual expenses, ranked.
  if (/\bexpenses?\b/i.test(text) && (HIGHEST.test(text) || LOWEST.test(text))) {
    return { kind: "topExpenses", order, limit: 1, filters };
  }

  // 6. A plain total, count or average.
  if (/\b(how much|how many|total|average|mean|spend|spent)\b/i.test(text)) {
    return { kind: "aggregate", measure, filters };
  }

  return unsupported(
    "I can answer totals, counts, averages and highest or lowest expenses, grouped by day, week, month, category or shop.",
  );
}
