import type { ReceiptData, Suggestion } from "../api";

/**
 * The boundary between "how the text was got off the image" and everything else.
 *
 * One method, one job: hand it a photo, get back a reading. Today the only
 * implementation runs OCR in the browser and has the arithmetic done on the
 * server. A vision model would be a second implementation that posts the image
 * somewhere and returns the same shape, and nothing downstream of this file
 * would change — which is the whole reason the seam is here rather than a few
 * layers up.
 *
 * That also means *how* the reading is obtained stays private to the extractor.
 * The scanner component knows it is waiting; it does not know whether the wait
 * is WebAssembly or a network call.
 */

/** Roughly what the extractor is doing, so a person is not staring at nothing. */
export type ExtractProgress = {
  /**
   * `loading` is the several-megabyte engine and language download, which only
   * happens once per browser and is by far the longest wait. It is named
   * separately for that reason: "still loading" and "still reading" are
   * different kinds of patience.
   */
  phase: "preparing" | "loading" | "reading" | "checking";
  /** 0 to 1 within the phase, or null when the step cannot report progress. */
  progress: number | null;
};

/**
 * A word and where it sits on the photo.
 *
 * These never leave the browser. The server is told what text it read and says
 * what it made of it; matching that back to pixels happens here, because the
 * pixels are here and nowhere else.
 */
export type WordBox = {
  text: string;
  /** Pixel coordinates in the image's own resolution, not the displayed size. */
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ReceiptReading = {
  receipt: ReceiptData;
  /** The same shape a parsed sentence produces, ready for the ordinary fields. */
  suggestion: Suggestion;
  words: WordBox[];
  /** An object URL for the prepared photo. The caller revokes it when finished. */
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  /**
   * What the reader saw, carried through even on success.
   *
   * A receipt that read *well enough* to reach the confirm step and still lost
   * its total is the case this answers: the text is right there to look at, so
   * "the total was never in the text" and "it was there and not matched" stop
   * being indistinguishable.
   */
  diagnostics: ReceiptDiagnostics;
};

/**
 * Why a scan did not produce a reading.
 *
 * A `kind` rather than a message, because the interface has to offer a different
 * way forward for each: a file that is not an image wants a different file, a
 * receipt with no text on it wants a better photo, and an engine that would not
 * load wants a reload or a typed sentence instead.
 */
export type ReceiptFailure =
  | "unsupported-type"
  | "too-large"
  /** The reader itself would not load. Nothing to do with the photo. */
  | "engine-failed"
  /** The reader ran and found nothing on the image. */
  | "no-text"
  /** The reader worked; asking the server what the text meant did not. */
  | "check-failed"
  | "failed";

/**
 * What the reader actually saw, whether or not it got anywhere.
 *
 * This exists because of a question nobody could answer: when a receipt comes
 * back with no total, is the total missing from the text, or present in it and
 * unmatched? Those need opposite fixes — a better photo against a better parser
 * — and without the text in front of you it is a coin toss.
 *
 * It is attached to failures as well as to successes, and that is the point. The
 * case that most needs explaining is the one that produces no screen at all: a
 * phone that read nothing. A console would do on a desktop; on a phone there is
 * no console to open, so the diagnosis has to be somewhere a thumb can reach it.
 */
export type ReceiptDiagnostics = {
  /** The size handed to the recogniser, after orientation and scaling. */
  preparedWidth: number;
  preparedHeight: number;
  /** The original, so a scaling problem is visible as a pair of numbers. */
  sourceBytes: number;
  sourceType: string;
  lineCount: number;
  wordCount: number;
  /** Tesseract's own score for the page, 0 to 100. Low means illegible. */
  meanConfidence: number;
  /** Exactly what came back, line by line. */
  lines: string[];
  /** The prepared image, so what the reader saw can be looked at. */
  imageUrl: string | null;
};

export class ReceiptError extends Error {
  constructor(
    public readonly kind: ReceiptFailure,
    message: string,
    /** Present whenever the reader got far enough to have something to report. */
    public readonly diagnostics?: ReceiptDiagnostics,
  ) {
    super(message);
    this.name = "ReceiptError";
  }
}

export interface ReceiptExtractor {
  extract(image: File, onProgress?: (progress: ExtractProgress) => void): Promise<ReceiptReading>;
}
