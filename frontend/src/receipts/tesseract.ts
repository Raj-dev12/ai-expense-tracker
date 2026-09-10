import { ApiError, readReceipt } from "../api";
import { prepareForOcr } from "./prepare";
import {
  ReceiptError,
  type ExtractProgress,
  type ReceiptDiagnostics,
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
export const ASSETS = "/tesseract";

/**
 * English and Finnish.
 *
 * Finnish costs another few megabytes of language data and earns it on the words
 * that matter: YHTEENSÄ, ALV, KORTTI, and the ä and ö in a shop's name. The
 * keyword matching tolerates OCR damage either way, but tolerating less damage
 * is better than tolerating more.
 */
export const LANGUAGES = ["eng", "fin"];

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
 * How long the engine gets to load before it is called a failure.
 *
 * Generous, because the first load is around thirty megabytes on a cold cache.
 * It exists because of how this failed in practice: a missing core variant threw
 * inside the worker as an *uncaught* error, so the promise never settled at all
 * and the screen sat on "Fetching the text reader" indefinitely. A wait with no
 * end is worse than a failure, because there is nothing to report and nothing to
 * do. This turns one into the other.
 */
const ENGINE_TIMEOUT_MS = 120_000;

/**
 * Whether a thrown thing is the engine failing to load rather than the receipt
 * failing to read.
 *
 * The distinction was missing, and it is exactly the one that mattered when this
 * broke: a core file that would not fetch produced "That receipt could not be
 * read. Try another photo", which sent somebody looking at their photo when the
 * problem was a missing asset on the server.
 *
 * Matched on the message because that is all a worker gives back. `importScripts`
 * is the browser's own wording when a worker cannot load a script; the rest are
 * the shapes a failed WebAssembly fetch takes.
 */
function looksLikeAnEngineFailure(caught: unknown): boolean {
  const message = caught instanceof Error ? `${caught.name} ${caught.message}` : String(caught);
  return /importScripts|NetworkError|WebAssembly|\.wasm|Failed to fetch|traineddata|SetImageFile|Load failed/i.test(
    message,
  );
}

/** Reject rather than hang, so a stall becomes something the screen can say. */
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ReceiptError("engine-failed", message)), ms),
    ),
  ]);
}

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

    onProgress?.({ phase: "preparing", progress: null });

    // Orientation applied, scaled down, greyscaled and contrast-stretched. A raw
    // phone photo is the hardest possible input and this is what turned "no text
    // found" on a phone into a reading. See prepare.ts.
    const prepared = await prepareForOcr(image);
    const { canvas, width, height, url: imageUrl } = prepared;

    try {
      onProgress?.({ phase: "loading", progress: null });

      const { createWorker, OEM } = await ENGINE();

      let worker;
      try {
        worker = await withTimeout(
          createWorker(LANGUAGES, OEM.LSTM_ONLY, {
            workerPath: `${ASSETS}/worker.min.js`,
            corePath: ASSETS,
            langPath: ASSETS,
            // The language files are the gzipped ones, which is what the sizes in
            // `public/tesseract` are.
            gzip: true,
            logger: (message) =>
              onProgress?.({ phase: phaseFor(message.status), progress: message.progress ?? null }),
            // Without this a failure inside the worker is an uncaught error that
            // never reaches the promise, which is how a missing core file turned
            // into a screen that waited for ever instead of saying anything.
            errorHandler: (error: unknown) => {
              console.error("receipt reader:", error);
            },
          }),
          ENGINE_TIMEOUT_MS,
          "The text reader did not finish loading. Check your connection and reload the page.",
        );
      } catch (caught) {
        if (caught instanceof ReceiptError) throw caught;
        throw new ReceiptError(
          "engine-failed",
          "The text reader could not be loaded. Reload the page, or type the expense instead.",
        );
      }

      let lines: string[] = [];
      let words: WordBox[] = [];
      let meanConfidence = 0;

      /**
       * What the reader saw, assembled whether or not it got anywhere.
       *
       * Built as a function so the failure paths below can call it with whatever
       * had been filled in by the time they were reached — a phone that read
       * nothing still has an image size and a word count of zero to report, and
       * those two numbers are most of the diagnosis.
       */
      const diagnose = (): ReceiptDiagnostics => ({
        preparedWidth: width,
        preparedHeight: height,
        sourceBytes: image.size,
        sourceType: image.type || "unknown",
        lineCount: lines.length,
        wordCount: words.length,
        meanConfidence: Math.round(meanConfidence),
        lines,
        imageUrl,
      });

      try {
        // `blocks` is what carries the geometry. Without it there is text and no
        // way to point at where on the photo it came from, which is most of the
        // reason this screen is worth having.
        // The prepared canvas, not the original file. The word positions that
        // come back are in *these* coordinates, which is why the confirm step
        // shows this canvas too — anything else and the boxes would sit ninety
        // degrees away from the text after an orientation fix.
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });

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
        meanConfidence = data.confidence ?? 0;

        // Always, not only on failure. A desktop console is the quickest way to
        // read forty lines, and this is the text the parser was given — so
        // "the total was not in the text" and "it was there and not matched"
        // stop being the same observation.
        console.info(
          `receipt: ${lines.length} lines, ${words.length} words, confidence ${Math.round(meanConfidence)}%, prepared ${width}x${height}`,
        );
        console.info(lines.join("\n"));
      } catch (caught) {
        // A core file that would not fetch throws here rather than above,
        // because the worker loads it lazily on the first recognition. Before
        // this branch existed it landed in the generic bucket and blamed the
        // photo.
        throw looksLikeAnEngineFailure(caught)
          ? new ReceiptError(
              "engine-failed",
              "The text reader could not be loaded. Reload the page, or type the expense instead.",
              diagnose(),
            )
          : new ReceiptError("failed", "That photo could not be read.", diagnose());
      } finally {
        await worker.terminate();
      }

      if (lines.length === 0) {
        // The case that most needs explaining, and the one with no screen of its
        // own to explain it on. The diagnostics carry the prepared image and its
        // size, which between them answer the two likeliest questions: did the
        // orientation fix work, and was it scaled to something sane.
        throw new ReceiptError(
          "no-text",
          "The text reader ran, but found no text on that photo.",
          diagnose(),
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
        diagnostics: diagnose(),
      };
    } catch (caught) {
      // A ReceiptError carrying diagnostics owns the image now — the failure
      // screen displays it, so revoking here would blank the one picture that
      // explains what went wrong. Whoever shows it releases it.
      if (caught instanceof ReceiptError) {
        if (!caught.diagnostics) URL.revokeObjectURL(imageUrl);
        throw caught;
      }

      URL.revokeObjectURL(imageUrl);
      // The endpoint answered with something. That is a different failure from
      // the reading, and saying so stops it being reported as a bad photo.
      if (caught instanceof ApiError) throw new ReceiptError("check-failed", caught.message);
      if (looksLikeAnEngineFailure(caught)) {
        throw new ReceiptError(
          "engine-failed",
          "The text reader could not be loaded. Reload the page, or type the expense instead.",
        );
      }
      throw new ReceiptError("failed", "That receipt could not be read.");
    }
  }
}
