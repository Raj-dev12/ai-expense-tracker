import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { readReceipt, type ReceiptData } from "./api";
import { PREPARATIONS } from "./receipts/prepare";
import { ASSETS, LANGUAGES } from "./receipts/tesseract";
import {
  BUCKETS,
  bucketOf,
  parseTruthTotal,
  scoreReading,
  type Bucket,
  type Score,
  type TotalCell,
  type Truth,
} from "./receipts/score";
import "./index.css";

/**
 * A bench for measuring whether a preprocessing step actually helped.
 *
 * WHY THIS IS A SEPARATE PAGE
 * ---------------------------
 * Every other check in this project runs in Node against jsdom. This one cannot:
 * the whole thing under test is canvas pixel work — `getImageData`, resampling,
 * thresholds — and jsdom has no canvas. Stubbing one would mean measuring the
 * stub. So it runs in a real browser, which is also the only place the code will
 * ever actually run.
 *
 * It is `compare.html`, a second entry point. Vite serves any HTML file in the
 * project root during development and builds only `index.html`, so this page is
 * reachable at `/compare.html` while developing and *cannot* be deployed. That is
 * deliberate rather than convenient: it loads somebody's real receipts.
 *
 * WHAT IT IS FOR
 * --------------
 * One question: did a change to `prepare.ts` make things better or worse? That
 * cannot be answered by looking at a reading, because the failure that matters is
 * a plausible wrong number, and a plausible wrong number looks like a success.
 * It needs a photo whose correct answer somebody has written down, and it needs
 * the same photo run through every preparation so the difference is attributable.
 *
 * Run the backend first — the arithmetic checks live there, and they are half of
 * what is being measured.
 */

/** Where the typed answers live. Not the repository and not the server. */
const LABEL_KEY = "receipt-fixture-labels";

const EMPTY: Truth = { merchant: "", date: "", total: "" };

type Loaded = {
  file: File;
  bucket: Bucket;
  /** The original photo, for looking at beside the prepared one. */
  thumbUrl: string;
};

/**
 * How Tesseract is told to carve the page up, which is not a preprocessing step
 * and belongs in the grid anyway.
 *
 * `tesseract.ts` sets no page segmentation mode at all, so the engine runs its
 * default: full automatic layout analysis, *including* splitting the page into
 * columns. A till receipt is two columns with a wide gutter — descriptions on the
 * left, amounts flush right — which is precisely the shape that analysis is built
 * to separate.
 *
 * If it separates them, `YHTEENSÄ` and `13,62` come back on different text lines,
 * and `findTotal` is looking for a line with a keyword *and* an amount on it. The
 * receipt would be perfectly legible and the total still unfindable, and nothing
 * about the pixels would be wrong.
 *
 * That is a third possibility beside "the pixels lost it" and "the parser chose
 * wrongly", and it matters for what to build next: neither local binarisation nor
 * perspective correction would move it an inch. So it is measured here rather than
 * argued about, and it costs one extra pass per photo to settle.
 *
 * `SINGLE_BLOCK` is the usual recommendation for receipts precisely because it
 * refuses to look for columns. Named rather than numbered — the engine's own enum
 * is resolved from the dynamic import at run time, so there is no magic "6" here
 * and no second copy of the library in the bundle.
 */
const SEGMENTATIONS = [
  { id: "auto", label: "automatic layout", psm: "AUTO" },
  { id: "block", label: "one block of text", psm: "SINGLE_BLOCK" },
] as const;

/** Every preparation crossed with every segmentation. One row of the grid each. */
const VARIANTS = PREPARATIONS.flatMap((preparation) =>
  SEGMENTATIONS.map((segmentation) => ({
    id: `${preparation.id}+${segmentation.id}`,
    label: `${preparation.label} · ${segmentation.label}`,
    prepare: preparation.prepare,
    psm: segmentation.psm,
  })),
);

type Attempt = {
  photo: string;
  bucket: Bucket;
  variantId: string;
  variantLabel: string;
  /** Milliseconds for preparation plus recognition, so the cost is visible too. */
  ms: number;
} & (
  | {
      ok: true;
      receipt: ReceiptData;
      score: Score;
      lines: string[];
      wordCount: number;
      /** Recorded, never scored. See `score.ts`. */
      confidence: number;
      width: number;
      height: number;
      /** The prepared pixels — what the engine was actually given. */
      imageUrl: string;
    }
  | { ok: false; error: string }
);

/**
 * Everything the run produced, as text somebody can paste somewhere.
 *
 * The bench renders its results into a browser, which is the right place to look
 * at them and the wrong place to get them out of. Reading forty numbers off a
 * screen and retyping them is both tedious and lossy, and this exercise will
 * produce that grid several more times as preparations are added.
 *
 * The three lines per field are the diagnosis, and they have to be read together:
 *
 *   - `digits in text` — were the truth's digits anywhere in what OCR returned
 *   - `parser matched` — what the backend actually latched onto, from
 *     `sources.total`. Empty means `findTotal` found no total line at all
 *   - `verdict` — what the arithmetic made of it
 *
 * Those three separate the failures that preprocessing can fix from the ones it
 * cannot. Digits absent means the pixels lost the number, and a sharper image is
 * the right answer. Digits present with nothing matched means the number survived
 * and the line around it did not — a damaged keyword, which sharper pixels may or
 * may not recover. Digits present and something matched means the parser found a
 * total and chose the wrong one, and no amount of image processing touches that.
 */
function report(attempts: Attempt[], labels: Record<string, Truth>): string {
  const out: string[] = [];

  for (const attempt of attempts) {
    const truth = labels[attempt.photo] ?? EMPTY;
    out.push(`=== ${attempt.photo} [${attempt.bucket}] · ${attempt.variantLabel} ===`);

    if (!attempt.ok) {
      out.push(`did not run: ${attempt.error}`, "");
      continue;
    }

    const say = (value: boolean | null) => (value === null ? "n/a" : value ? "YES" : "NO");

    out.push(
      `prepared ${attempt.width}x${attempt.height} · ${attempt.lines.length} lines · ` +
        `${attempt.wordCount} words · ${attempt.confidence}% confidence · ${(attempt.ms / 1000).toFixed(1)}s`,
    );
    out.push(
      `total    ${attempt.score.total.toUpperCase()} · truth ${truth.total} · read ` +
        `${attempt.score.readTotal === null ? "nothing" : attempt.score.readTotal.toFixed(2)} · ` +
        `digits in text ${say(attempt.score.inText.totalInText)} · ` +
        `parser matched ${attempt.receipt.sources.total === null ? "(nothing)" : `"${attempt.receipt.sources.total}"`}`,
    );
    out.push(`verdict  ${attempt.receipt.verdict.kind} — ${verdictWhy(attempt.receipt)}`);
    out.push(
      `merchant ${attempt.score.merchant.toUpperCase()} · truth "${truth.merchant}" · read ` +
        `${attempt.receipt.merchant === null ? "nothing" : `"${attempt.receipt.merchant}"`} · ` +
        `first word in text ${say(attempt.score.inText.merchantInText)}`,
    );
    out.push(
      `date     ${attempt.score.date.toUpperCase()} · truth ` +
        `${truth.dateAbsent ? "none printed" : truth.date || "(not recorded)"} · read ` +
        `${attempt.receipt.date ?? "nothing"}` +
        `${attempt.score.dateInvented ? " · INVENTED" : ""}`,
    );
    // The sum, not just the count. When a correct total is contradicted, the gap
    // between this and the total is the whole story — and whether it is short or
    // over says which kind of OCR damage did it.
    const itemSum = attempt.receipt.items.reduce((running, item) => running + item.amount, 0);
    out.push(
      `items    ${attempt.receipt.items.length} read · they sum to ${itemSum.toFixed(2)}` +
        (attempt.receipt.total === null && attempt.score.readTotal === null
          ? ""
          : ` · total ${(attempt.score.readTotal ?? 0).toFixed(2)} · gap ${(itemSum - (attempt.score.readTotal ?? 0)).toFixed(2)}`) +
        (attempt.receipt.vat === null ? " · no VAT line" : ` · VAT ${attempt.receipt.vat}`),
    );
    out.push("--- text ---");
    out.push(attempt.lines.join("\n") || "(nothing)");
    out.push("");
  }

  return out.join("\n");
}

/** The sentence the verdict carries, whichever shape it is. */
function verdictWhy(receipt: ReceiptData): string {
  const verdict = receipt.verdict;
  if (verdict.kind === "corroborated") return `by ${verdict.by}`;
  if (verdict.kind === "unverified") return verdict.why;
  if (verdict.kind === "absent") return verdict.why;
  return `${verdict.problem}${verdict.suggested === null ? "" : ` (suggests ${verdict.suggested})`}`;
}

function loadLabels(): Record<string, Truth> {
  try {
    const raw = localStorage.getItem(LABEL_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Truth>) : {};
  } catch {
    // A corrupt or unavailable store is not worth failing the page over. Worst
    // case the labels get typed again.
    return {};
  }
}

/** Tesseract's own commentary, reduced to the two states worth showing. */
function phaseOf(status: string): string {
  return status.includes("recognizing") ? "reading" : "loading the reader";
}

const CELL_LABEL: Record<TotalCell, string> = {
  "read-and-said-so": "Read it, said so",
  "cried-wolf": "Cried wolf",
  "silent-wrong-answer": "Silent wrong answer",
  "caught-it": "Caught it",
  "nothing-read": "Nothing read",
};

/**
 * Only one of these is loud, and it is the only one that can hurt somebody.
 *
 * A wrong total that nothing contradicted is the failure this whole feature is
 * designed against, so it is the one result on the page that is impossible to
 * scroll past. "Cried wolf" is merely annoying and "nothing read" is visible to
 * the person confirming, so neither gets shouted about.
 */
const CELL_STYLE: Record<TotalCell, string> = {
  "read-and-said-so": "bg-accent-soft text-accent-strong",
  "cried-wolf": "bg-amber-50 text-amber-800",
  "silent-wrong-answer": "bg-red-700 text-white",
  "caught-it": "bg-slate-100 text-slate-600",
  "nothing-read": "bg-slate-100 text-slate-500",
};

function Mark({ outcome }: { outcome: Score["merchant"] }) {
  if (outcome === "right") return <span className="text-accent-strong">right</span>;
  if (outcome === "wrong") return <span className="font-medium text-red-700">wrong</span>;
  if (outcome === "missing") return <span className="text-slate-400">missing</span>;
  return <span className="text-slate-300">not scored</span>;
}

/** Whether the truth was in the raw text. `null` when the question does not apply. */
function Yes({ value }: { value: boolean | null }) {
  if (value === null) return null;
  return value ? (
    <span className="text-slate-600">in the text</span>
  ) : (
    <span className="text-slate-400">not in the text</span>
  );
}

/** What came back, and whether the right answer was in the text to begin with. */
function Read({ value, inText }: { value: string | null; inText: boolean | null }) {
  return (
    <span className="ml-2 text-slate-500">
      read {value ?? "nothing"}
      {inText !== null && (
        <>
          {" · "}
          <Yes value={inText} />
        </>
      )}
    </span>
  );
}

function App() {
  const [photos, setPhotos] = useState<Loaded[]>([]);
  const [labels, setLabels] = useState<Record<string, Truth>>(loadLabels);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Blob URLs outlive a render, so they are tracked outside one and released when
  // a new run replaces them. Thirty-odd full-size PNGs is real memory on a phone.
  const urls = useRef<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(LABEL_KEY, JSON.stringify(labels));
    } catch {
      // Private browsing, or a full store. The labels still work for this session.
    }
  }, [labels]);

  function load(files: FileList | null) {
    if (!files) return;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current = [];
    setAttempts([]);

    const loaded = Array.from(files)
      .filter((file) => file.type.startsWith("image/") || /\.(hei[cf])$/i.test(file.name))
      .map((file) => {
        const thumbUrl = URL.createObjectURL(file);
        urls.current.push(thumbUrl);
        return { file, bucket: bucketOf(file.name), thumbUrl };
      })
      .sort((a, b) => {
        const order = (bucket: Bucket) =>
          bucket === "unsorted" ? BUCKETS.length : BUCKETS.indexOf(bucket as never);
        return order(a.bucket) - order(b.bucket) || a.file.name.localeCompare(b.file.name);
      });

    setPhotos(loaded);
  }

  function setTruth(name: string, patch: Partial<Truth>) {
    setLabels((previous) => ({ ...previous, [name]: { ...EMPTY, ...previous[name], ...patch } }));
  }

  /**
   * A photo is worth running once its total is known.
   *
   * The total alone, deliberately. It is what the scoreboard turns on, and every
   * other field is scored when a truth for it exists and left out of the counts
   * when it does not. Requiring all three would have made an unrecorded field
   * block the photo entirely — which is exactly what happened the first time
   * these receipts turned out not to carry dates.
   */
  const ready = photos.filter(
    (photo) => parseTruthTotal(labels[photo.file.name]?.total ?? "") !== null,
  );

  async function run() {
    setRunning(true);
    setAttempts([]);
    // The prepared images from the previous run go, the original thumbnails stay.
    const keep = new Set(photos.map((photo) => photo.thumbUrl));
    for (const url of urls.current) if (!keep.has(url)) URL.revokeObjectURL(url);
    urls.current = [...keep];

    try {
      setStatus("Loading the text reader");
      const { createWorker, OEM, PSM } = await import("tesseract.js");

      // One worker for the entire run. Creating one per photo would re-download
      // and re-initialise thirty megabytes of engine and language data each time,
      // and would also mean every reading was done by a different instance.
      const worker = await createWorker(LANGUAGES, OEM.LSTM_ONLY, {
        workerPath: `${ASSETS}/worker.min.js`,
        corePath: ASSETS,
        langPath: ASSETS,
        gzip: true,
        logger: (message: { status: string; progress?: number }) =>
          setStatus(`${phaseOf(message.status)} — ${Math.round((message.progress ?? 0) * 100)}%`),
        errorHandler: (error: unknown) => console.error("compare:", error),
      });

      try {
        for (const photo of ready) {
          const truth = labels[photo.file.name] ?? EMPTY;

          for (const variant of VARIANTS) {
            setStatus(`${photo.file.name} — ${variant.label}`);
            const started = performance.now();

            // Each cell is wrapped on its own. A run that aborts on photo three of
            // nine has wasted the other six, and the failures are data too.
            try {
              const prepared = await variant.prepare(photo.file);
              urls.current.push(prepared.url);

              // Set per attempt, not once for the worker: the whole point is to
              // read the same pixels under two different segmentations.
              await worker.setParameters({ tessedit_pageseg_mode: PSM[variant.psm] });

              const { data } = await worker.recognize(prepared.canvas, {}, { text: true, blocks: true });

              const allLines = (data.blocks ?? []).flatMap((block) =>
                block.paragraphs.flatMap((paragraph) => paragraph.lines),
              );
              const lines = allLines.map((line) => line.text.trim()).filter(Boolean);
              const wordCount = allLines.reduce((running, line) => running + line.words.length, 0);

              const answer = await readReceipt(lines);

              setAttempts((previous) => [
                ...previous,
                {
                  photo: photo.file.name,
                  bucket: photo.bucket,
                  variantId: variant.id,
                  variantLabel: variant.label,
                  ms: Math.round(performance.now() - started),
                  ok: true,
                  receipt: answer.receipt,
                  score: scoreReading(answer.receipt, lines, truth),
                  lines,
                  wordCount,
                  confidence: Math.round(data.confidence ?? 0),
                  width: prepared.width,
                  height: prepared.height,
                  imageUrl: prepared.url,
                },
              ]);
            } catch (caught) {
              setAttempts((previous) => [
                ...previous,
                {
                  photo: photo.file.name,
                  bucket: photo.bucket,
                  variantId: variant.id,
                  variantLabel: variant.label,
                  ms: Math.round(performance.now() - started),
                  ok: false,
                  error: caught instanceof Error ? caught.message : String(caught),
                },
              ]);
            }
          }
        }
      } finally {
        await worker.terminate();
      }

      setStatus(null);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  /**
   * The scoreboard, one row per variant.
   *
   * Counts rather than percentages, deliberately. With eight or nine photos a
   * percentage implies a precision that is not there, and invites comparing two
   * numbers that differ by one receipt as though the difference meant something.
   */
  const tallies = useMemo(() => {
    return VARIANTS.map((variant) => {
      const mine = attempts.filter((attempt) => attempt.variantId === variant.id);
      const good = mine.filter((attempt) => attempt.ok);

      const cells = {} as Record<TotalCell, number>;
      for (const key of Object.keys(CELL_LABEL) as TotalCell[]) cells[key] = 0;
      for (const attempt of good) if (attempt.ok) cells[attempt.score.cell] += 1;

      // Scored out of what was actually labelled, not out of everything run. A
      // field nobody typed a truth for is not a failed read, and counting it as
      // one would make a preparation look worse the less anyone bothered to label.
      const scored = (field: "merchant" | "date") =>
        good.filter((a) => a.ok && a.score[field] !== "unscored").length;
      const right = (field: "merchant" | "date") =>
        good.filter((a) => a.ok && a.score[field] === "right").length;

      return {
        variant,
        attempted: mine.length,
        failed: mine.length - good.length,
        cells,
        // The total was right, whatever the checks then said about it. This is
        // the count "read it, said so" plus "cried wolf", and keeping it out of
        // the table was how five correct totals got reported as none.
        totalRight: good.filter((a) => a.ok && a.score.total === "right").length,
        totalScored: good.filter((a) => a.ok && a.score.total !== "unscored").length,
        merchantRight: right("merchant"),
        merchantScored: scored("merchant"),
        dateRight: right("date"),
        dateScored: scored("date"),
        /** A date produced for a receipt that has not got one. */
        datesInvented: good.filter((a) => a.ok && a.score.dateInvented).length,
        meanConfidence:
          good.length === 0
            ? 0
            : Math.round(good.reduce((sum, a) => sum + (a.ok ? a.confidence : 0), 0) / good.length),
        meanMs:
          good.length === 0 ? 0 : Math.round(good.reduce((sum, a) => sum + a.ms, 0) / good.length),
      };
    });
  }, [attempts]);

  const groups = useMemo(() => {
    const order: Bucket[] = [...BUCKETS, "unsorted"];
    return order
      .map((bucket) => ({ bucket, photos: photos.filter((photo) => photo.bucket === bucket) }))
      .filter((group) => group.photos.length > 0);
  }, [photos]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-slate-800">
      <h1 className="text-2xl font-medium">Receipt preprocessing comparison</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Runs every preparation in <code className="text-xs">prepare.ts</code> over the same photos
        and scores each reading against what you say the receipt actually says. The engine's own
        confidence is shown and never scored — sharpening an image raises it whether or not the
        letters were right, so it cannot judge a change whose purpose is to sharpen the image.
      </p>
      <p className="mt-2 text-sm text-slate-500">
        The backend has to be running: the arithmetic checks are half of what is measured. Photos
        stay in this browser. Nothing is uploaded and nothing is saved.
      </p>

      <section className="mt-8 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">The photos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pick everything in <code className="text-xs">receipt-fixtures/</code>. The group comes from
          the name — <code className="text-xs">flat-01.jpg</code>, <code className="text-xs">dim-01.jpg</code>,{" "}
          <code className="text-xs">angled-01.jpg</code>, <code className="text-xs">creased-01.jpg</code>.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Only the total is required. Leave a field blank and it is left out of the counts rather
          than scored as a failure. If a receipt has no date printed on it,{" "}
          <strong>tick "no date on it"</strong> rather than leaving the box empty: that says the
          right answer is no date, and turns the photo into a test of whether the parser invents
          one.
        </p>
        <input
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          onChange={(event) => load(event.target.files)}
          className="mt-3 block text-sm"
        />

        {groups.map((group) => (
          <div key={group.bucket} className="mt-6">
            <h3 className="text-sm font-medium capitalize">
              {group.bucket}
              <span className="ml-2 font-normal text-slate-500">
                {group.bucket === "flat" && "— the regression guard. These must not get worse."}
                {group.bucket === "dim" && "— what local binarisation is supposed to fix."}
                {group.bucket === "angled" && "— what perspective correction is supposed to fix."}
                {group.bucket === "creased" && "— expected to stay broken."}
                {group.bucket === "unsorted" && "— the name did not say which group. Rename it."}
              </span>
            </h3>

            <div className="mt-2 space-y-2">
              {group.photos.map((photo) => {
                const truth = labels[photo.file.name] ?? EMPTY;
                return (
                  <div
                    key={photo.file.name}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3"
                  >
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      className="h-16 w-12 rounded object-cover ring-1 ring-slate-200"
                    />
                    <span className="w-40 truncate text-sm">{photo.file.name}</span>
                    <input
                      value={truth.merchant}
                      onChange={(event) => setTruth(photo.file.name, { merchant: event.target.value })}
                      placeholder="Merchant"
                      className="w-44 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="date"
                      value={truth.date}
                      disabled={truth.dateAbsent === true}
                      onChange={(event) => setTruth(photo.file.name, { date: event.target.value })}
                      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    {/*
                      An empty box and "this receipt has no date on it" are not the
                      same statement, and the second is worth far more. An empty box
                      can only be skipped. Ticking this says the correct answer is
                      *no date*, which makes any date the parser produces an
                      invention — and `findDate` can invent one from a product code
                      that happens to be shaped like a date.
                    */}
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={truth.dateAbsent === true}
                        onChange={(event) =>
                          setTruth(photo.file.name, {
                            dateAbsent: event.target.checked,
                            date: event.target.checked ? "" : truth.date,
                          })
                        }
                      />
                      no date on it
                    </label>
                    <input
                      value={truth.total}
                      inputMode="decimal"
                      onChange={(event) => setTruth(photo.file.name, { total: event.target.value })}
                      placeholder="Total"
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {photos.length > 0 && (
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={run}
              disabled={running || ready.length === 0}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
            >
              {running ? "Running" : `Run ${ready.length} photo${ready.length === 1 ? "" : "s"}`}
            </button>
            <span className="text-sm text-slate-500">
              {ready.length} of {photos.length} with a total typed
              {VARIANTS.length > 1 && ` · ${VARIANTS.length} variants each`}
            </span>
          </div>
        )}

        {status && <p className="mt-3 text-sm text-slate-500">{status}</p>}
      </section>

      {attempts.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">The scoreboard</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            A preparation is an improvement when <em>read it, said so</em> goes up{" "}
            <strong>and silent wrong answers do not</strong>. A step that gains two correct totals
            and adds one silent wrong answer has made the feature worse: the correct ones were going
            to be checked by a person anyway, and the wrong one will not be.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-normal">Variant</th>
                  {/*
                    The plainest question, and it was missing.

                    A correct total that the checks contradicted lands under
                    "cried wolf", which reads as a failure — so five correctly
                    read totals sat in a column named after the complaint about
                    them, and the scoreboard was reported as zero. The count of
                    totals that were simply right now leads, and the cells behind
                    it say what was made of them.
                  */}
                  <th className="py-2 pr-4 font-normal">Total correct</th>
                  <th className="py-2 pr-4 font-normal">Read it, said so</th>
                  <th className="py-2 pr-4 font-normal text-red-700">Silent wrong answer</th>
                  <th className="py-2 pr-4 font-normal">Caught it</th>
                  <th className="py-2 pr-4 font-normal">Cried wolf</th>
                  <th className="py-2 pr-4 font-normal">Nothing read</th>
                  <th className="py-2 pr-4 font-normal">Merchant</th>
                  <th className="py-2 pr-4 font-normal">Date</th>
                  <th className="py-2 pr-4 font-normal text-red-700">Invented a date</th>
                  <th className="py-2 pr-4 font-normal">Confidence</th>
                  <th className="py-2 font-normal">Time</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {tallies.map((tally) => (
                  <tr key={tally.variant.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4">{tally.variant.label}</td>
                    <td className="py-2 pr-4 font-medium">
                      {tally.totalRight}/{tally.totalScored}
                    </td>
                    <td className="py-2 pr-4">{tally.cells["read-and-said-so"]}</td>
                    <td
                      className={`py-2 pr-4 ${tally.cells["silent-wrong-answer"] > 0 ? "font-medium text-red-700" : ""}`}
                    >
                      {tally.cells["silent-wrong-answer"]}
                    </td>
                    <td className="py-2 pr-4">{tally.cells["caught-it"]}</td>
                    <td className="py-2 pr-4">{tally.cells["cried-wolf"]}</td>
                    <td className="py-2 pr-4">{tally.cells["nothing-read"]}</td>
                    <td className="py-2 pr-4">
                      {tally.merchantScored === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        `${tally.merchantRight}/${tally.merchantScored}`
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {tally.dateScored === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        `${tally.dateRight}/${tally.dateScored}`
                      )}
                    </td>
                    <td
                      className={`py-2 pr-4 ${tally.datesInvented > 0 ? "font-medium text-red-700" : ""}`}
                    >
                      {tally.datesInvented}
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{tally.meanConfidence}%</td>
                    <td className="py-2 text-slate-500">{(tally.meanMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            <strong>Invented a date</strong> counts receipts marked as having no date printed on
            them that came back with one anyway. Nothing on the paper supports it, so it did not
            come off the receipt — it came from a run of digits that happened to be date-shaped,
            and it will look entirely deliberate on the confirm step. Preprocessing can move this
            number in either direction, because it changes which digits are legible.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Confidence is greyed out because it is not a result. Watch for it rising while the
            columns to its left stay flat — that is a cleaner-looking image that is still wrong,
            which is the thing this table exists to catch.
          </p>
        </section>
      )}

      {attempts.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">Photo by photo</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            <em>In the text</em> is the one that says which thing to fix. A total that was in the
            text and still came out wrong is a parser problem; a total that was never in the text is
            a photo problem. Preprocessing can only move the second kind.
          </p>

          <div className="mt-4 space-y-3">
            {attempts.map((attempt, index) => (
              <details
                key={`${attempt.photo}-${attempt.variantId}-${index}`}
                className="rounded-lg bg-slate-50 p-3"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs capitalize text-slate-600">
                    {attempt.bucket}
                  </span>
                  <span className="font-medium">{attempt.photo}</span>
                  <span className="text-slate-500">{attempt.variantLabel}</span>
                  {attempt.ok ? (
                    <span className={`rounded px-2 py-0.5 text-xs ${CELL_STYLE[attempt.score.cell]}`}>
                      {CELL_LABEL[attempt.score.cell]}
                    </span>
                  ) : (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                      did not run
                    </span>
                  )}
                </summary>

                {attempt.ok ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-[16rem_1fr]">
                    <figure className="m-0">
                      {/*
                        The prepared pixels, not the original. This is the whole
                        point of the panel: a step that did something unhelpful is
                        visible here and nowhere else.
                      */}
                      <img
                        src={attempt.imageUrl}
                        alt="The photo as the reader received it"
                        className="w-full rounded ring-1 ring-slate-200"
                      />
                      <figcaption className="mt-1 text-xs text-slate-400">
                        What the reader was given — {attempt.width} × {attempt.height},{" "}
                        {attempt.wordCount} words, {attempt.confidence}% confidence,{" "}
                        {(attempt.ms / 1000).toFixed(1)}s
                      </figcaption>
                    </figure>

                    <div className="text-sm">
                      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
                        <dt className="text-slate-400">Merchant</dt>
                        <dd>
                          <Mark outcome={attempt.score.merchant} />
                          <Read
                            value={attempt.receipt.merchant}
                            inText={attempt.score.inText.merchantInText}
                          />
                        </dd>

                        <dt className="text-slate-400">Date</dt>
                        <dd>
                          <Mark outcome={attempt.score.date} />
                          <Read value={attempt.receipt.date} inText={attempt.score.inText.dateInText} />
                          {attempt.score.dateInvented && (
                            <span className="ml-2 rounded bg-red-700 px-2 py-0.5 text-xs text-white">
                              invented — the receipt has no date on it
                            </span>
                          )}
                        </dd>

                        <dt className="text-slate-400">Total</dt>
                        <dd>
                          <Mark outcome={attempt.score.total} />
                          <Read
                            value={
                              attempt.score.readTotal === null
                                ? null
                                : attempt.score.readTotal.toFixed(2)
                            }
                            inText={attempt.score.inText.totalInText}
                          />
                        </dd>

                        {/*
                          What the parser actually latched onto. Read together
                          with "in the text" above, this is what says whether a
                          sharper image could have helped: digits absent means the
                          pixels lost the number, digits present with nothing
                          matched means the number survived and the line around it
                          did not, and digits present with something matched means
                          the parser chose wrongly and no image processing touches
                          it.
                        */}
                        <dt className="text-slate-400">Matched</dt>
                        <dd className="text-slate-600">
                          {attempt.receipt.sources.total === null ? (
                            <span className="text-slate-400">
                              no line was read as a total
                            </span>
                          ) : (
                            <code className="text-xs">{attempt.receipt.sources.total}</code>
                          )}
                        </dd>

                        <dt className="text-slate-400">Verdict</dt>
                        <dd className="text-slate-600">
                          {attempt.receipt.verdict.kind} — {verdictWhy(attempt.receipt)}
                        </dd>

                        <dt className="text-slate-400">Items</dt>
                        <dd className="text-slate-600">
                          {attempt.receipt.items.length} read
                          {attempt.receipt.items.length === 0 &&
                            " — so the strongest arithmetic check had nothing to work with"}
                        </dd>
                      </dl>

                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-3 text-xs leading-relaxed ring-1 ring-slate-200">
                        {attempt.lines.join("\n") || "No text at all came back."}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-red-700">{attempt.error}</p>
                )}
              </details>
            ))}
          </div>
        </section>
      )}

      {attempts.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">The whole run, as text</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Every attempt with its three diagnostic lines and the raw text underneath, so the
            results can leave this browser without being retyped. Read{" "}
            <em>digits in text</em>, <em>parser matched</em> and <em>verdict</em> together: they
            are what separates a failure a sharper image could fix from one it could not.
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(report(attempts, labels));
            }}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Copy to the clipboard
          </button>
          <textarea
            readOnly
            value={report(attempts, labels)}
            rows={12}
            // Also on the page, because a clipboard write can be refused and
            // selecting text out of a box always works.
            className="mt-3 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          />
        </section>
      )}

      {photos.length > 0 && (
        <details className="mt-6 rounded-xl bg-white p-5 text-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer font-medium">The labels, as text</summary>
          <p className="mt-2 text-slate-600">
            Kept in this browser's storage, which a cleared cache takes with it. Copy this somewhere
            if retyping them would annoy you; paste it back to restore.
          </p>
          <textarea
            value={JSON.stringify(labels, null, 2)}
            onChange={(event) => {
              try {
                setLabels(JSON.parse(event.target.value) as Record<string, Truth>);
              } catch {
                // Half-pasted JSON is not an error worth reporting. It becomes
                // valid when the paste finishes.
              }
            }}
            rows={8}
            className="mt-2 w-full rounded border border-slate-300 p-2 font-mono text-xs"
          />
        </details>
      )}
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("No #root element to mount into");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
