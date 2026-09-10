import { ReceiptError } from "./extractor";

/**
 * Getting a photo into a state Tesseract can actually read.
 *
 * There was none of this. The `File` went straight into `recognize()`, which is
 * the hardest possible version of the task, and it showed: a receipt that read
 * poorly on a desktop returned no text at all from the same receipt on a phone.
 *
 * Three things are done here, and each fixes a specific way a phone photo defeats
 * OCR.
 *
 * ORIENTATION
 * -----------
 * A phone does not rotate the pixels when you turn it. It writes the pixels in
 * the sensor's orientation and adds an EXIF tag saying which way up they belong.
 * Software is supposed to honour that tag; a canvas historically did not, so an
 * image that is upright everywhere you look at it can arrive at the recogniser
 * rotated a quarter turn — and text on its side reads as nothing at all, which
 * is exactly the symptom. `createImageBitmap` with `imageOrientation:
 * "from-image"` applies the tag, so the pixels handed on are the right way up.
 *
 * SIZE
 * ----
 * A phone camera produces something like 4000 pixels across. Tesseract does not
 * want that — it is slow, it is a great deal of memory on a phone, and past a
 * point the extra pixels carry no extra letters. Receipt text wants roughly 300
 * dots per inch, which for an 80mm receipt is about a thousand pixels across; a
 * long edge of two thousand leaves plenty of headroom for a receipt that only
 * fills part of the frame, and is a quarter of the pixels of a raw photo.
 *
 * CONTRAST
 * --------
 * Thermal paper is grey text on off-white, photographed under whatever light was
 * there. Converting to grey and stretching the range so the darkest ink is
 * properly black and the paper properly white makes the letters separable.
 * Deliberately *not* black-and-white: Tesseract does its own thresholding and
 * does it better with grey than with something already thrown away.
 */

/**
 * The longest edge, in pixels, after scaling.
 *
 * Only ever scales down. Enlarging a small photo adds pixels and no letters.
 */
const MAX_EDGE = 2000;

/**
 * How much of the range to clip before stretching, at each end.
 *
 * A glare spot or a dark fold would otherwise define "white" and "black" on its
 * own and flatten everything between them. Ignoring the extreme two percent
 * means the stretch is set by the paper and the ink rather than by the worst
 * pixel in the frame.
 */
const CLIP = 0.02;

export type PreparedImage = {
  /** What the recogniser reads, and what the confirm step shows. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** A blob URL for the processed pixels. The caller revokes it. */
  url: string;
};

/**
 * Decode the file with its orientation applied.
 *
 * `createImageBitmap` is the path that honours EXIF reliably. The `<img>`
 * fallback exists for browsers without it, and is second choice precisely
 * because whether it rotates is the thing that varies.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Falls through to the img path rather than failing: a decoder that
      // refuses the options is still a decoder.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new ReceiptError("unsupported-type", "That image could not be opened."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

/**
 * Grey, with the range stretched to fill black-to-white.
 *
 * The luminance weights are the usual ones: the eye, and a scanner, get most of
 * their detail from green. A flat average would wash out red ink on white paper,
 * which some receipts use for the total of all things.
 */
function toReadableGrey(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  const histogram = new Uint32Array(256);

  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(
      0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0),
    );
    pixels[i] = grey;
    pixels[i + 1] = grey;
    pixels[i + 2] = grey;
    histogram[grey] = (histogram[grey] ?? 0) + 1;
  }

  // The levels at which the darkest and lightest CLIP of the picture sit.
  const total = width * height;
  const wanted = Math.floor(total * CLIP);

  let low = 0;
  let high = 255;
  let seen = 0;
  for (let level = 0; level < 256; level += 1) {
    seen += histogram[level] ?? 0;
    if (seen > wanted) { low = level; break; }
  }
  seen = 0;
  for (let level = 255; level >= 0; level -= 1) {
    seen += histogram[level] ?? 0;
    if (seen > wanted) { high = level; break; }
  }

  // A blank or single-tone image has nothing to stretch, and dividing by the
  // range would be dividing by zero.
  if (high - low < 8) {
    context.putImageData(image, 0, 0);
    return;
  }

  const scale = 255 / (high - low);
  const lookup = new Uint8ClampedArray(256);
  for (let level = 0; level < 256; level += 1) {
    lookup[level] = Math.max(0, Math.min(255, Math.round((level - low) * scale)));
  }

  for (let i = 0; i < pixels.length; i += 4) {
    const stretched = lookup[pixels[i] ?? 0] ?? 0;
    pixels[i] = stretched;
    pixels[i + 1] = stretched;
    pixels[i + 2] = stretched;
  }

  context.putImageData(image, 0, 0);
}

/**
 * A photo, made readable.
 *
 * The processed canvas is what gets recognised *and* what the confirm step
 * displays. That is deliberate: the word positions come back in these
 * coordinates, so showing anything else would mean the boxes on the photo and
 * the pixels under them could drift apart — and after an orientation fix they
 * would drift by ninety degrees. Showing what was actually read also means a
 * scan that failed shows you why.
 */
export async function prepareForOcr(file: File): Promise<PreparedImage> {
  const source = await decode(file);
  const { width: sourceWidth, height: sourceHeight } = sizeOf(source);

  if (!sourceWidth || !sourceHeight) {
    throw new ReceiptError("unsupported-type", "That image could not be opened.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new ReceiptError("failed", "This browser could not prepare the image for reading.");
  }

  // Smoothing on the way down. Nearest-neighbour on a four-thousand-pixel photo
  // drops whole strokes out of small text.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);

  if (source instanceof ImageBitmap) source.close();

  toReadableGrey(context, width, height);

  const url = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new ReceiptError("failed", "That image could not be prepared for reading.")),
      "image/png",
    );
  });

  return { canvas, width, height, url };
}

/**
 * One way of preparing a photo, named so a result can be attributed to it.
 *
 * The list exists because of the question "did that step help?", which cannot be
 * answered by a pipeline with one path through it. The comparison harness runs
 * every entry over the same photo and puts the readings side by side; the app
 * itself still calls `prepareForOcr` and is unaffected by anything added here.
 */
export type Preparation = {
  /** Stable across runs, so a saved result can be matched to the step that made it. */
  id: string;
  /** Shown in the harness. Sentence case, like the rest of the interface. */
  label: string;
  prepare: (file: File) => Promise<PreparedImage>;
};

/**
 * Every preparation worth comparing, baseline first.
 *
 * Only the baseline for now, on purpose: the point of measuring before changing
 * anything is to have a number from *before*. Local binarisation and perspective
 * correction become entries beside it, and the grid then says what each one did
 * rather than what the two of them together did.
 */
export const PREPARATIONS: Preparation[] = [
  {
    id: "current",
    label: "Grey and a global contrast stretch",
    prepare: prepareForOcr,
  },
];
