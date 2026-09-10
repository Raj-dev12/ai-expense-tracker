import type { ReceiptData } from "../api";

/**
 * Judging a reading against what the paper actually said.
 *
 * WHY NOT THE ENGINE'S CONFIDENCE
 * -------------------------------
 * Tesseract's confidence is how cleanly the shape it saw matches the glyph it
 * picked. Sharpen an image and that number rises whether or not the glyph was the
 * right one — so for a change whose whole purpose is to sharpen the image, the
 * engine's confidence is the one measure guaranteed to approve of it. It is
 * recorded for interest and never scored.
 *
 * WHY NOT THE ARITHMETIC VERDICT EITHER
 * -------------------------------------
 * `backend/src/receipts/checks.ts` decides whether a total can be believed by
 * checking it against the lines, the VAT and the amount paid. That is a genuinely
 * independent signal, and it is the right thing to *choose* a preparation with.
 * Which is exactly why it cannot also be the thing that measures one: a selector
 * and its own scoreboard are the same instrument twice, and a number that grades
 * its own chooser can only go up.
 *
 * So the measure is a person typing what the receipt says. It is the only input
 * here that no amount of preprocessing can influence.
 */

/** What the paper says, typed in by hand. The total as written, comma or point. */
export type Truth = {
  merchant: string;
  /** ISO, `yyyy-mm-dd`. Blank means nobody recorded one — see `dateAbsent`. */
  date: string;
  /**
   * The receipt does not print a date at all.
   *
   * Not the same as leaving the box empty, and the difference is the whole value
   * of these photos. A blank box means "nobody wrote it down", which can only be
   * skipped. This flag means "the right answer is *no date*" — and that turns a
   * receipt with no date on it into the sharpest test in the set.
   *
   * `findDate` in `backend/src/receipts/normalize.ts` takes the first date-shaped
   * run of digits on any line, and `NUMERIC_DATE` matches things that are not
   * dates: a product code or a phone number reading `05-06-24` is a real date in
   * the past and is accepted as one. On a receipt that has a date, an invention
   * like that is hidden behind the correct answer. On a receipt that has none,
   * there is nothing to hide behind.
   *
   * A date invented out of a barcode is exactly the failure this project has now
   * had four times: not an absent value, which is visible, but a plausible one,
   * which is not.
   */
  dateAbsent?: boolean;
  total: string;
};

/**
 * How a field came out.
 *
 * `missing` is kept apart from `wrong` because they are not the same failure and
 * do not want the same fix. A field that came back empty is visible to the person
 * confirming; a field that came back with the wrong value in it looks exactly as
 * deliberate as a right one. This project has had the second failure three times
 * and it is the one the whole receipt design is arranged against.
 *
 * `unscored` is not a result at all. It means there was nothing to compare
 * against, because nobody typed a truth for that field — and it is kept separate
 * from `missing` so it can stay out of the denominators. Counting an unrecorded
 * field as a failed read would make a preparation look worse the less anyone
 * bothered to label.
 */
export type FieldOutcome = "right" | "wrong" | "missing" | "unscored";

/**
 * What happened to the total, crossed with whether the checks noticed.
 *
 * This is the cell that decides whether a preparation step is worth keeping, and
 * `silent-wrong-answer` is the only one that can hurt somebody. A step that gains
 * two correct totals and adds one silent wrong answer has made the feature worse,
 * because the two correct ones were already going to be checked by a human and
 * the wrong one is going to sail past them.
 */
export type TotalCell =
  /** Correct, and nothing contradicted it. The outcome you want. */
  | "read-and-said-so"
  /** Correct, but the checks called it wrong. Annoying, not dangerous. */
  | "cried-wolf"
  /** Wrong, and nothing caught it. The dangerous one. */
  | "silent-wrong-answer"
  /** Wrong, and the checks said so. A bad read, safely handled. */
  | "caught-it"
  /** No total came off the receipt at all. Visible, so not dangerous. */
  | "nothing-read";

/**
 * Whether the truth was anywhere in the text, regardless of what was parsed out.
 *
 * The one question the debug panel exists to answer, made countable: when a field
 * comes back wrong, was the right value missing from the text, or present in it
 * and unmatched? Those need opposite fixes — a better photo against a better
 * parser — and a grid that cannot tell them apart sends half the work to the
 * wrong place.
 *
 * So these are the honest way to read a preparation change. Preprocessing can
 * only move these three. If they stay flat and the parsed fields move, something
 * other than the pixels changed.
 *
 * `null` means the question does not apply — there is no truth to look for, either
 * because nobody typed one or because the receipt genuinely has not got one.
 */
export type InText = {
  merchantInText: boolean | null;
  dateInText: boolean | null;
  totalInText: boolean | null;
};

export type Score = {
  merchant: FieldOutcome;
  date: FieldOutcome;
  total: FieldOutcome;
  cell: TotalCell;
  /**
   * A date was produced for a receipt that has not got one.
   *
   * Broken out of `date: "wrong"` because it is a different and worse thing than
   * misreading a date that was there. Nothing on the paper supports it, so it did
   * not come from the receipt at all — it came from a run of digits that happened
   * to be date-shaped, and it will look entirely deliberate on the confirm step.
   */
  dateInvented: boolean;
  /** What the engine read for the total, including a value the checks rejected. */
  readTotal: number | null;
  inText: InText;
};

/** Letters and digits only, lowercased. Punctuation and spacing are noise here. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // The combining accents NFD has just split off, written as escapes rather
    // than as literal marks — a literal combining character in source is
    // invisible and does not survive being copied about.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Every digit in the line, in order. `24,90` and `24.90` and `2490` all become `2490`. */
function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** A typed total, tolerating a comma decimal. Null if it is not a number. */
export function parseTruthTotal(written: string): number | null {
  const cleaned = written.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Half a cent of slack, which is rounding rather than a misread. */
const CENT = 0.005;

/**
 * Did the merchant come out right?
 *
 * Containment either way, not an exact match, and deliberately lenient: the name
 * on the paper is routinely "K-Market Ruoholahti" where the parser tidies it to
 * "K-Market", and calling that wrong would mark a correct reading as a failure.
 * The leniency is stated rather than hidden because it is the one place this
 * scoring could flatter a change.
 */
function scoreMerchant(read: string | null, truth: string): FieldOutcome {
  if (!truth.trim()) return "unscored";
  if (!read || !read.trim()) return "missing";

  const a = fold(read);
  const b = fold(truth);
  if (!a || !b) return "missing";

  // Containment needs something substantial to contain. Without this, a merchant
  // that came back as the single letter "K" is inside "kmarket" and would score
  // as a correct read of K-Market — leniency turning into a false pass, which is
  // the one thing this file must not do.
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4) return a === b ? "right" : "wrong";

  return a.includes(b) || b.includes(a) ? "right" : "wrong";
}

/**
 * Did the date come out right — including when the right answer is "there isn't one"?
 *
 * The absent case is scored, not skipped, and it is the strictest test in the
 * file. A receipt with no date printed on it has nothing a date could legitimately
 * be read from, so any date at all is an invention, and `findDate` has a real way
 * of producing one: it takes the first date-shaped run of digits on any line, and
 * a product code or phone number in the shape `05-06-24` is a perfectly valid past
 * date. Nothing downstream would question it.
 */
function scoreDate(read: string | null, truth: Truth): FieldOutcome {
  if (truth.dateAbsent) return read === null ? "right" : "wrong";
  if (!truth.date.trim()) return "unscored";
  if (!read) return "missing";
  return read === truth.date.trim() ? "right" : "wrong";
}

/**
 * The total the engine actually read, which is not always the one on offer.
 *
 * A contradicted total is deliberately kept out of `ReceiptData.total`, so that a
 * figure the checks rejected can never be mistaken for one ready to save. For
 * scoring we want it anyway — "read it wrongly and caught it" and "did not read
 * it" are different results and the grid has to separate them.
 */
function readTotalFrom(receipt: ReceiptData): number | null {
  if (receipt.total !== null) return receipt.total;
  return receipt.verdict.kind === "contradicted" ? receipt.verdict.read : null;
}

/** Whether the checks declined to stand behind the total. */
function flagged(receipt: ReceiptData): boolean {
  return receipt.verdict.kind === "contradicted" || receipt.verdict.kind === "absent";
}

/**
 * Was each truth value present in the raw text at all?
 *
 * Matched loosely on purpose. The question is not whether the parser could find
 * it — that is what the parsed fields measure — but whether the pixels gave it up
 * in any recognisable form.
 */
function inText(lines: string[], truth: Truth): InText {
  const foldedLines = lines.map(fold);
  const digitLines = lines.map(digits);

  // The first word of the shop name, which is the part that carries it. A branch
  // name or a street after it is frequently damaged even on a good read, and
  // requiring it would report a recognisable name as absent.
  const firstWord = fold(truth.merchant.trim().split(/\s+/)[0] ?? "");
  const merchantInText =
    firstWord.length < 3 ? null : foldedLines.some((line) => line.includes(firstWord));

  // Day and month next to each other, which is what every date format on a
  // receipt has in common once the separators are gone. Not asked at all when the
  // receipt has no date: "was it in the text" has no answer when there is no it.
  const [, month = "", day = ""] = truth.date.trim().split("-");
  const dayMonth = `${day}${month}`;
  const dateInText =
    truth.dateAbsent || dayMonth.length !== 4
      ? null
      : digitLines.some((line) => line.includes(dayMonth));

  // The total's digits, with the separator ignored. `24,90`, `24.90`, `24 90` and
  // a run-together `2490` all reduce to the same thing — which is the point,
  // since a dropped separator is the misread this is most interested in.
  const total = parseTruthTotal(truth.total);
  const totalDigits = total === null ? "" : digits(total.toFixed(2));
  const totalInText =
    totalDigits.length === 0 ? null : digitLines.some((line) => line.includes(totalDigits));

  return { merchantInText, dateInText, totalInText };
}

export function scoreReading(receipt: ReceiptData, lines: string[], truth: Truth): Score {
  const readTotal = readTotalFrom(receipt);
  const wanted = parseTruthTotal(truth.total);

  let total: FieldOutcome;
  if (wanted === null) total = "unscored";
  else if (readTotal === null) total = "missing";
  else total = Math.abs(readTotal - wanted) <= CENT ? "right" : "wrong";

  let cell: TotalCell;
  if (readTotal === null) cell = "nothing-read";
  else if (total === "right") cell = flagged(receipt) ? "cried-wolf" : "read-and-said-so";
  else cell = flagged(receipt) ? "caught-it" : "silent-wrong-answer";

  const date = scoreDate(receipt.date, truth);

  return {
    merchant: scoreMerchant(receipt.merchant, truth.merchant),
    date,
    dateInvented: Boolean(truth.dateAbsent) && date === "wrong",
    total,
    cell,
    readTotal,
    inText: inText(lines, truth),
  };
}

/** The bucket a fixture filename declares, or `unsorted` if it declares nothing. */
export const BUCKETS = ["flat", "dim", "angled", "creased"] as const;
export type Bucket = (typeof BUCKETS)[number] | "unsorted";

/**
 * Which group a photo belongs to, from the part of its name before the hyphen.
 *
 * A misnamed file lands in `unsorted` rather than in a bucket it does not belong
 * to. Counting a creased receipt among the flat ones would quietly destroy the
 * only thing the flat bucket is for.
 */
export function bucketOf(filename: string): Bucket {
  const prefix = filename.toLowerCase().split(/[-_.]/)[0] ?? "";
  return (BUCKETS as readonly string[]).includes(prefix) ? (prefix as Bucket) : "unsorted";
}
