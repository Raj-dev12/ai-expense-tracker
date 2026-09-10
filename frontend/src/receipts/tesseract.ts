import { ApiError, readReceipt } from "../api";
import {
  ReceiptError,
  type ExtractProgress,
  type ReceiptExtractor,
  type ReceiptReading,
  type WordBox,
} from "./extractor";

/**
 * Reading a receipt with Tesseract, in the browser.
 *
 * WHY IN THE BROWSER
 * ------------------
 * Three reasons, and only the first is about privacy. The photo never leaves the
 * device, so there is nothing to upload, store or delete. There is no filesystem
 * on the serverless deployment to put an image on even if we wanted to. And it
 * works with no API key and no paid service, which is the promise the whole
 * project is built on.
 *
 * It also happens to retire the objection that kept receipt photos out of scope
 * in the first place — "needs file uploads and image storage" — because with the
 * work done here there is neither.
 *
 * WHAT IS SENT
 * ------------
 * The lines of text, and nothing else. The word boxes stay here, because the
 * only thing they are good for is drawing on a photo the server never sees.
 */

/** Loaded on demand. Several megabytes of WebAssembly has no business in the first paint. */
const ENGINE = () => import("tesseract.js");

/**
 * Where the engine and the language data are served from.
 *
 * Self-hosted under `public/` rather than fetched from a CDN. A CDN would keep
 * the repository small and make the feature quietly dependent on a third party
 * being reachable — offline, or behind a restrictive network, scanning would
 * simply stop working with no way to tell why from inside the app.
 */
const ASSETS = "/tesseract";

/**
 * English and Finnish.
 *
 * Finnish costs another few megabytes of language data and earns it on the words
 * that matter: YHTEENSÄ, ALV, KORTTI, and the ä and ö in a shop's name. The
 * keyword matching tolerates OCR damage either way, but tolerating less damage
 * is better than tolerating more.
 */
const LANGUAGES = ["eng", "fin"];

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
];

/** A phone photo is two to five megabytes. Twelve is a generous ceiling. */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Turn the engine's running commentary into something worth showing.
 *
 * Tesseract reports a dozen internal statuses. They collapse to two questions a
 * person actually has — is it still fetching, or is it actually reading — plus
 * the wait on the server afterwards.
 */
function phaseFor(status: string): ExtractProgress["phase"] {
  if (status.includes("recognizing")) return "reading";
  return "loading";
}

/** The image's own pixel dimensions, which is what the word boxes are measured in. */
function measure(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new ReceiptError("unsupported-type", "That image could not be opened."));
    image.src = url;
  });
}

export class TesseractReceiptExtractor implements ReceiptExtractor {
  async extract(
    image: File,
    onProgress?: (progress: ExtractProgress) => void,
  ): Promise<ReceiptReading> {
    // Checked before anything expensive happens. A person who picked a PDF
    // should be told so immediately, not after a ten megabyte download.
    if (image.type && !ACCEPTED_TYPES.includes(image.type)) {
      throw new ReceiptError("unsupported-type", "That is not an image this can read.");
    }
    if (image.size > MAX_BYTES) {
      throw new ReceiptError("too-large", "That image is too large. Try a smaller photo.");
    }

    const imageUrl = URL.createObjectURL(image);

    try {
      const { width, height } = await measure(imageUrl);

      onProgress?.({ phase: "loading", progress: null });

      const { createWorker, OEM } = await ENGINE();

      let worker;
      try {
        worker = await createWorker(LANGUAGES, OEM.LSTM_ONLY, {
          workerPath: `${ASSETS}/worker.min.js`,
          corePath: ASSETS,
          langPath: ASSETS,
          // The language files are the gzipped ones, which is what the sizes in
          // `public/tesseract` are.
          gzip: true,
          logger: (message) =>
            onProgress?.({ phase: phaseFor(message.status), progress: message.progress ?? null }),
        });
      } catch {
        throw new ReceiptError(
          "engine-failed",
          "The text reader could not start. Reload the page and try again.",
        );
      }

      let lines: string[];
      let words: WordBox[];

      try {
        // `blocks` is what carries the geometry. Without it there is text and no
        // way to point at where on the photo it came from, which is most of the
        // reason this screen is worth having.
        const { data } = await worker.recognize(image, {}, { text: true, blocks: true });

        const allLines = (data.blocks ?? []).flatMap((block) =>
          block.paragraphs.flatMap((paragraph) => paragraph.lines),
        );

        lines = allLines.map((line) => line.text.trim()).filter(Boolean);
        words = allLines.flatMap((line) =>
          line.words.map((word) => ({
            text: word.text,
            left: word.bbox.x0,
            top: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0,
          })),
        );
      } finally {
        await worker.terminate();
      }

      if (lines.length === 0) {
        throw new ReceiptError(
          "no-text",
          "No text could be found on that image. Try a straighter, brighter photo.",
        );
      }

      onProgress?.({ phase: "checking", progress: null });

      const answer = await readReceipt(lines);

      return {
        receipt: answer.receipt,
        suggestion: answer.suggestion,
        words,
        imageUrl,
        imageWidth: width,
        imageHeight: height,
      };
    } catch (caught) {
      // The photo is the only thing holding memory here, and nothing downstream
      // will get the chance to release it if this throws.
      URL.revokeObjectURL(imageUrl);

      if (caught instanceof ReceiptError) throw caught;
      if (caught instanceof ApiError) throw new ReceiptError("failed", caught.message);
      throw new ReceiptError("failed", "That receipt could not be read.");
    }
  }
}
