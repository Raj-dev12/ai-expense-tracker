import { useRef, useState } from "react";
import type { ExtractProgress, ReceiptFailure, ReceiptReading } from "../receipts/extractor";
import { ReceiptError } from "../receipts/extractor";
import { TesseractReceiptExtractor } from "../receipts/tesseract";

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
 * because the way forward differs: a wrong file wants a different file, an
 * unreadable photo wants a better photo, and an engine that would not start
 * wants a reload or the typing box instead.
 */
const FAILURES: Record<ReceiptFailure, string> = {
  "unsupported-type": "That file is not an image. Choose a photo, or type the expense instead.",
  "too-large": "That image is too large. Try a smaller photo, or type the expense instead.",
  "engine-failed": "The text reader could not start. Reload the page, or type the expense instead.",
  "no-text": "No text could be found on that photo. Try again with more light and less angle, or type the expense instead.",
  failed: "That receipt could not be read. Try another photo, or type the expense instead.",
};

function progressLine(progress: ExtractProgress): string {
  const percent = progress.progress === null ? "" : ` ${Math.round(progress.progress * 100)}%`;

  switch (progress.phase) {
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

  const scanning = progress !== null;

  async function handleFile(file: File | undefined) {
    if (!file || scanning) return;

    setError(null);
    setProgress({ phase: "loading", progress: null });

    try {
      onRead(await extractor.extract(file, setProgress));
    } catch (caught) {
      setError(
        caught instanceof ReceiptError ? FAILURES[caught.kind] : FAILURES.failed,
      );
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
    </div>
  );
}
