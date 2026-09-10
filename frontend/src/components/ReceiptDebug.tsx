import type { ReceiptDiagnostics } from "../receipts/extractor";

/**
 * Exactly what the reader saw, on screen.
 *
 * WHY THIS IS NOT A CONSOLE LOG
 * -----------------------------
 * It is one as well — but a console is a desktop thing, and the failure that
 * needed explaining was on a phone. "Mobile found nothing readable on the same
 * receipt the desktop handled" is not a report anybody can act on, and there was
 * no way to turn it into one from the phone itself.
 *
 * WHAT IT ANSWERS
 * ---------------
 * One question, and it is the question that decides which thing to fix: when a
 * receipt comes back with no total, **is the total missing from the text, or
 * present in it and unmatched?** A missing total is a photo or a preprocessing
 * problem. An unmatched one is a parser problem. Without the text in front of
 * you the two are indistinguishable, and half the work of guessing goes on the
 * wrong one.
 *
 * The numbers above the text answer the next two: the prepared size says whether
 * the orientation and scaling did what they were supposed to, and the confidence
 * says whether the picture was legible at all.
 *
 * Folded away by default. It is a diagnostic, not part of the job.
 */
export function ReceiptDebug({
  diagnostics,
  showImage = false,
}: {
  diagnostics: ReceiptDiagnostics;
  /**
   * Show the prepared image too.
   *
   * On by default only where nothing else shows it — a failure screen. The
   * confirm step already has the picture beside the fields, and a second copy
   * inside a fold would be noise.
   */
  showImage?: boolean;
}) {
  const kilobytes = Math.round(diagnostics.sourceBytes / 1024);

  return (
    <details className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <summary className="cursor-pointer text-slate-700">
        What the reader actually saw
        {diagnostics.lineCount > 0 && ` — ${diagnostics.lineCount} lines`}
      </summary>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {[
          ["Prepared size", `${diagnostics.preparedWidth} × ${diagnostics.preparedHeight}`],
          ["From", `${kilobytes} kB ${diagnostics.sourceType}`],
          ["Words", String(diagnostics.wordCount)],
          ["Confidence", `${diagnostics.meanConfidence}%`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-400">{label}</dt>
            <dd className="tabular-nums text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>

      {showImage && diagnostics.imageUrl && (
        <figure className="m-0 mt-3">
          <img
            src={diagnostics.imageUrl}
            alt="The photo after it was prepared for reading"
            className="max-h-64 rounded ring-1 ring-slate-200"
          />
          <figcaption className="mt-1 text-xs text-slate-400">
            {/*
              The single most useful thing on a failure screen. If this is on its
              side, orientation is the bug; if it is a grey smear, the photo is.
              Either way it is visible without a console.
            */}
            The image as the reader received it — rotated, scaled and contrasted.
            If this is sideways or unreadable, that is the problem.
          </figcaption>
        </figure>
      )}

      {diagnostics.lines.length > 0 ? (
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">
          {diagnostics.lines.join("\n")}
        </pre>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          No text at all came back. With a confidence of {diagnostics.meanConfidence}% and no
          words found, the reader could not make out characters — so this is the picture, not the
          parsing.
        </p>
      )}
    </details>
  );
}
