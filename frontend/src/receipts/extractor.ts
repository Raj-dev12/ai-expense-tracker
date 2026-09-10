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
  phase: "loading" | "reading" | "checking";
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
  /** An object URL for the photo. The caller revokes it when finished. */
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
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

export class ReceiptError extends Error {
  constructor(
    public readonly kind: ReceiptFailure,
    message: string,
  ) {
    super(message);
    this.name = "ReceiptError";
  }
}

export interface ReceiptExtractor {
  extract(image: File, onProgress?: (progress: ExtractProgress) => void): Promise<ReceiptReading>;
}
