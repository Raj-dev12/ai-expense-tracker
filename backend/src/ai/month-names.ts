/**
 * Month names the parser will recognise, in English and Finnish.
 *
 * Finnish is here because the app assumes a Finnish user everywhere else it
 * assumes anything — the numeric date format it already read is day-first
 * `4.9.2026`, and the time zone is Europe/Helsinki. Somebody who types dates
 * that way will sometimes type "4. syyskuuta" as well.
 *
 * WHAT FINNISH MONTH NAMES LOOK LIKE
 * ----------------------------------
 * Every Finnish month is a compound ending in `kuu`, "moon": *syyskuu* is
 * September. In a date the word changes ending, because Finnish marks the role
 * of a word with a suffix rather than with a preposition:
 *
 *   syyskuu     the month itself
 *   syyskuuta   "of September" — what a written date uses: "4. syyskuuta"
 *   syyskuussa  "in September"
 *   syyskuun    "September's" — "syyskuun 4."
 *   syys        the bare stem, which is also how it is abbreviated
 *
 * So each month is one stem plus a small set of endings, generated below rather
 * than written out sixty times. The endings are a closed list: these are the
 * ones that appear in dates, not every form the language has.
 *
 * WHY THIS IS A LOOKUP RATHER THAN A CLEVER REGEX
 * -----------------------------------------------
 * The alternation used to find a month in a sentence is built *from* this table,
 * longest name first. That matters for one specific collision: `mar` is March
 * and `marras` is November, and a shorter alternative listed first would match
 * the first three letters of "marras" and read November as March. Sorting by
 * length removes the trap rather than documenting it.
 */

/** English, full and abbreviated. `sept` as well as `sep`, because people write both. */
const ENGLISH: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * The Finnish stems. Two spellings where the word has a front vowel: a Finnish
 * keyboard gives `ä` directly, but people typing quickly, or on a phone set to
 * English, write `kesa` and `heina`.
 */
const FINNISH_STEMS: Record<string, number> = {
  tammi: 1,
  helmi: 2,
  maalis: 3,
  huhti: 4,
  touko: 5,
  "kesä": 6, kesa: 6,
  "heinä": 7, heina: 7,
  elo: 8,
  syys: 9,
  loka: 10,
  marras: 11,
  joulu: 12,
};

/** The endings a Finnish month name takes when it is part of a date. */
const FINNISH_ENDINGS = ["", "kuu", "kuuta", "kuussa", "kuun"];

const NAMES = new Map<string, number>();

for (const [name, month] of Object.entries(ENGLISH)) NAMES.set(name, month);

for (const [stem, month] of Object.entries(FINNISH_STEMS)) {
  for (const ending of FINNISH_ENDINGS) NAMES.set(stem + ending, month);
}

/**
 * Month names that are also ordinary words, and so are not treated as a date on
 * their own.
 *
 * Only one so far, and it earns the exception: "may" is a common English verb,
 * and a sentence containing it is far more often "I may have spent too much"
 * than a date. It still works when a day number sits beside it — "may 4" and
 * "4 may" are read normally — because a number next to it is the evidence that
 * was missing.
 *
 * The Finnish stems are left out of this list deliberately. `elo` and `loka`
 * are words too, but a sentence about a purchase written in Finnish is far more
 * likely to be naming a month than to contain either in its bare form.
 */
const ALSO_ORDINARY_WORDS = new Set(["may"]);

/**
 * The month a word names, or null.
 *
 * Case and a trailing full stop are both ignored, so "Sept.", "sept" and "SEPT"
 * are one thing. The full stop matters because it is how English abbreviates and
 * how Finnish writes an ordinal: "4. syyskuuta".
 */
export function monthFromName(word: string): number | null {
  const key = word.toLowerCase().replace(/\.$/, "");
  return NAMES.get(key) ?? null;
}

/** Whether this month name is one that needs a day beside it to count as a date. */
export function needsADayBeside(word: string): boolean {
  return ALSO_ORDINARY_WORDS.has(word.toLowerCase().replace(/\.$/, ""));
}

/**
 * The alternation used inside the date patterns, longest name first.
 *
 * Every name here is letters only, so nothing needs escaping — but the sort is
 * load-bearing. See the note at the top of this file about `mar` and `marras`.
 */
export const MONTH_NAME_PATTERN = [...NAMES.keys()]
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Exported for the checks, which assert the table covers twelve months in both languages. */
export const MONTH_NAME_COUNT = NAMES.size;
