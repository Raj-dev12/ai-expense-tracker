import type { WordBox } from "../receipts/extractor";

/**
 * The photo, with the values that were read marked on it.
 *
 * This is the difference between verifying and approving. Typing "24.50 at Lidl"
 * means you already know what you meant, and the confirm step is only guarding
 * against the parser. A receipt is the other way round: the figures on screen
 * are the first time you have looked at them closely, and "does 24,90 look
 * right" is not a question you can answer from the number alone. Being shown
 * *where on the receipt* it came from is.
 *
 * WHY NOT A CANVAS
 * ----------------
 * The obvious way to draw boxes on a photo is a canvas, and it is the wrong one
 * here. A canvas needs the displayed size in pixels, so it needs re-drawing on
 * every resize and every zoom, and it produces nothing a check running outside a
 * browser can see. Positioned elements sized as a percentage of the image scale
 * themselves, survive any layout, and are ordinary markup — so the checks can
 * assert that the total really was marked without a browser being involved.
 */

/**
 * How much of the picture one value's box is allowed to cover.
 *
 * A total, a date or a shop name occupies a line, not a page. A box larger than
 * this is not a box round a value — it is the union of several things that
 * should not have matched, and drawing it points at everything and therefore at
 * nothing.
 */
const MAX_BOX_SHARE = 0.5;

/**
 * The union of the words that make up one value, as a fraction of the image.
 *
 * THE MATCHING HAS TO BE TIGHT
 * ----------------------------
 * It was not, and the boxes landed off the receipt entirely. The test was
 * whether the word's text appeared *anywhere inside* the value, which sounds
 * reasonable until the page is mostly OCR noise: looking for "K-MARKET" then
 * matched a stray "AR" in one corner and an "ET" in another — both genuinely
 * substrings of it — and the union of those three stretched across three
 * quarters of the photo.
 *
 * Reproduced at 74% × 97% of the image before this was tightened. It is worth
 * being precise about what it was *not*: the displayed image is the prepared
 * canvas and the percentages are in that canvas's coordinates, so nothing was
 * mis-scaled. A perfectly correct coordinate can still point at the wrong thing.
 *
 * Now a word has to *be* one of the value's words, or be a long enough piece of
 * one to be unambiguous — "MARKET" for "K-MARKET" when OCR split the hyphen, but
 * never a two-letter fragment.
 */
function boxFor(source: string | null, words: WordBox[], imageWidth: number, imageHeight: number): WordBox | null {
  if (!source) return null;

  const tokens = source
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return null;

  const parts = words.filter((word) => {
    const text = word.text.trim();
    if (text.length < 2) return false;
    return tokens.some(
      (token) =>
        token === text ||
        // A piece of a token, but only one long enough that it could not be a
        // coincidence. Four characters is where receipt noise stops producing
        // accidental matches.
        (text.length >= 4 && token.includes(text)),
    );
  });

  if (parts.length === 0) return null;

  const left = Math.min(...parts.map((part) => part.left));
  const top = Math.min(...parts.map((part) => part.top));
  const right = Math.max(...parts.map((part) => part.left + part.width));
  const bottom = Math.max(...parts.map((part) => part.top + part.height));

  const width = right - left;
  const height = bottom - top;

  // Last guard. Even with tight matching, a receipt whose OCR is mostly rubbish
  // can throw up two words that legitimately match and sit at opposite corners.
  // Drawing nothing is better than drawing a box round the whole photo, which
  // claims to point at something and does not.
  if (width > imageWidth * MAX_BOX_SHARE && height > imageHeight * MAX_BOX_SHARE) return null;

  return { text: source, left, top, width, height };
}

type Marked = { label: string; source: string | null; tone: "read" | "doubted" };

export function ReceiptImage({
  imageUrl,
  imageWidth,
  imageHeight,
  words,
  marked,
}: {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  words: WordBox[];
  /** What to point at, and whether it is a value being offered or one being questioned. */
  marked: Marked[];
}) {
  const boxes = marked
    .map((mark) => ({ ...mark, box: boxFor(mark.source, words, imageWidth, imageHeight) }))
    .filter((mark): mark is Marked & { box: WordBox } => mark.box !== null);

  // A little breathing room round the words, so the box frames the number
  // rather than clipping it.
  const pad = Math.max(imageWidth, imageHeight) * 0.006;

  return (
    <figure className="m-0">
      <div className="relative overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
        <img
          src={imageUrl}
          alt="The receipt you photographed"
          className="block w-full"
        />

        {boxes.map((mark) => (
          <div
            key={mark.label}
            data-marked={mark.label}
            className={[
              "absolute rounded-sm ring-2",
              mark.tone === "doubted" ? "ring-red-500 bg-red-500/10" : "ring-accent bg-accent/10",
            ].join(" ")}
            style={{
              // Percentages of the image's own resolution, so this is correct at
              // any displayed size without measuring anything.
              left: `${((mark.box.left - pad) / imageWidth) * 100}%`,
              top: `${((mark.box.top - pad) / imageHeight) * 100}%`,
              width: `${((mark.box.width + pad * 2) / imageWidth) * 100}%`,
              height: `${((mark.box.height + pad * 2) / imageHeight) * 100}%`,
            }}
          >
            <span
              className={[
                "absolute -top-0.5 left-0 -translate-y-full rounded px-1 text-[10px] font-medium text-white",
                mark.tone === "doubted" ? "bg-red-500" : "bg-accent",
              ].join(" ")}
            >
              {mark.label}
            </span>
          </div>
        ))}
      </div>

      {boxes.length < marked.length && (
        <figcaption className="mt-2 text-xs text-slate-400">
          {/*
            Said plainly rather than left to be noticed. A value with no box is
            not marked wrong — the reader simply could not point at where it came
            from — and letting a person assume the boxes are complete would be
            its own quiet way of overstating what has been checked.
          */}
          Not everything could be pointed at on the photo. Check those values
          against the receipt yourself.
        </figcaption>
      )}
    </figure>
  );
}
