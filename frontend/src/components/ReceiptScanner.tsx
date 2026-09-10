import { useRef, useState } from "react";
import type {
  ExtractProgress,
  ReceiptDiagnostics,
  ReceiptFailure,
  ReceiptReading,
} from "../receipts/extractor";
import { ReceiptError } from "../receipts/extractor";
import { TesseractReceiptExtractor } from "../receipts/tesseract";
import { ReceiptDebug } from "./ReceiptDebug";

/**
 * Choosing a photo, and waiting while it is read.
 *
 * The waiting is the part worth designing. The first scan in a browser downloads
 * several megabytes of text-recognition engine, and on a slow connection that is
 * long enough that a spinner with no explanation reads as broken. So the two
 * waits are named separately: fetching the reader, and reading the receipt.
 * Afterwards they are the same wait, because the engine is cached.
 */

/** One extractor, kept across scans so the engine is not re-fetched needlessly. */
const extractor = new TesseractReceiptExtractor();

/**
 * What to say when it does not work, and what to offer next.
 *
 * Each failure gets its own sentence rather than one apology for all of them,
 * because the way forward differs entirely — and the first time this broke in a
 * real browser, it did not. A missing engine file reported "That receipt could
 * not be read. Try another photo", which sent somebody to inspect a photo that
 * was fine while the actual problem was a file missing from the server. The
 * three that get confused with each other are worth naming:
 *
 *   engine-failed — the reader never loaded. Nothing to do with the photo, and
 *                   a different photo will not help.
 *   no-text       — the reader ran and found nothing. The photo is the problem.
 *   check-failed  — the reader worked and the server did not. Neither is the
 *                   photo's fault.
 *
 * A fourth case is not an error at all and must not look like one: text was
 * read but no total was found. That goes to the confirm step, where the photo is
 * shown with an empty amount box, because everything else on the receipt is
 * still worth keeping.
 */
const FAILURES: Record<ReceiptFailure, string> = {
  "unsupported-type": "That file is not an image. Choose a photo, or type the expense instead.",
  "too-large": "That image is too large. Try a smaller photo, or type the expense instead.",
  "engine-failed":
    "The text reader could not be loaded, so nothing was read from the photo. This is not a problem with the image. Reload the page, or type the expense instead.",
  "no-text":
    "The text reader ran, but found no text on that photo. Try again with more light, less angle and the whole receipt in frame.",
  "check-failed":
    "The text was read, but the server could not be reached to check it. Try again in a moment, or type the expense instead.",
  failed: "That receipt could not be read. Try another photo, or type the expense instead.",
};

function progressLine(progress: ExtractProgress): string {
  const percent = progress.progress === null ? "" : ` ${Math.round(progress.progress * 100)}%`;

  switch (progress.phase) {
    case "preparing":
      return "Preparing the photo...";
    case "loading":
      return `Fetching the text reader${percent}. This happens once.`;
    case "reading":
      return `Reading the receipt${percent}...`;
    case "checking":
      return "Checking the numbers add up...";
  }
}

export function ReceiptScanner({
  busy,
  onRead,
}: {
  /** True while something else on the page is mid-flight, so two cannot overlap. */
  busy: boolean;
  onRead: (reading: ReceiptReading) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * What the reader saw when it failed, kept so it can be shown.
   *
   * A failure carries the prepared image with it, which means this component
   * owns an object URL and has to release it — on the next attempt, and when the
   * failure is replaced by a success.
   */
  const [failed, setFailed] = useState<ReceiptDiagnostics | null>(null);

  const scanning = progress !== null;

  function forget() {
    if (failed?.imageUrl) URL.revokeObjectURL(failed.imageUrl);
    setFailed(null);
  }

  async function handleFile(file: File | undefined) {
    if (!file || scanning) return;

    setError(null);
    forget();
    setProgress({ phase: "preparing", progress: null });

    try {
      onRead(await extractor.extract(file, setProgress));
    } catch (caught) {
      setError(
        caught instanceof ReceiptError ? FAILURES[caught.kind] : FAILURES.failed,
      );
      // The diagnosis, on screen rather than in a console, because the failure
      // worth diagnosing happened on a phone where there is no console to open.
      if (caught instanceof ReceiptError && caught.diagnostics) setFailed(caught.diagnostics);
    } finally {
      setProgress(null);
      // Cleared so that choosing the same file twice fires a change event. Left
      // alone, a second attempt at the same photo after a failure does nothing
      // at all, which reads as the button being broken.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        // Opens the camera directly on a phone rather than the photo library,
        // which is what somebody standing at a till wants.
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy || scanning}
        // Deliberately not the accent colour. "Read this" is the page's one
        // primary action and a second coloured button beside it would be two
        // things competing for the same glance.
        className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        {scanning ? "Scanning..." : "Scan receipt"}
      </button>

      {progress && (
        <div className="space-y-1" role="status">
          <p className="text-sm text-slate-500">{progressLine(progress)}</p>
          {progress.progress !== null && (
            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {failed && <ReceiptDebug diagnostics={failed} showImage />}
    </div>
  );
}
