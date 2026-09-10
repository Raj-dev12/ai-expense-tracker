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

/** The union of the words that make up one value, as a fraction of the image. */
function boxFor(source: string | null, words: WordBox[]): WordBox | null {
  if (!source) return null;

  const wanted = source.replace(/\s+/g, "");
  if (wanted.length < 2) return null;

  // Words whose text is part of what was read. Short fragments are skipped: a
  // stray "21" appearing elsewhere on the receipt would stretch the box across
  // half the photo.
  const parts = words.filter((word) => {
    const text = word.text.replace(/\s+/g, "");
    return text.length >= 2 && wanted.includes(text);
  });

  if (parts.length === 0) return null;

  const left = Math.min(...parts.map((part) => part.left));
  const top = Math.min(...parts.map((part) => part.top));
  const right = Math.max(...parts.map((part) => part.left + part.width));
  const bottom = Math.max(...parts.map((part) => part.top + part.height));

  return { text: source, left, top, width: right - left, height: bottom - top };
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
    .map((mark) => ({ ...mark, box: boxFor(mark.source, words) }))
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
