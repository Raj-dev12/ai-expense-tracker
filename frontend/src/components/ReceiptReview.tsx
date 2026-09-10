import { useState } from "react";
import type { NewExpense, ReceiptData, TotalVerdict, Suggestion } from "../api";
import type { WordBox } from "../receipts/extractor";
import {
  ExpenseFields,
  amountIsUsable,
  parseAmount,
  type ExpenseFieldValues,
} from "./ExpenseFields";
import { ReceiptImage } from "./ReceiptImage";

/**
 * Checking a scanned receipt before it is saved.
 *
 * Deliberately not `SuggestionReview`, even though both end in the same fields
 * and the same save. They are different tasks. When you type "24.50 at Lidl" you
 * already know what you meant, and the confirm step is guarding against the
 * parser misreading you. When you photograph a receipt you may not have read it
 * closely at all — the numbers on screen are the first time you are looking at
 * them properly — so the screen has to let you *check*, not merely agree.
 *
 * Which is why the photo is here, with the values marked on it.
 *
 * THE FOUR VERDICTS
 * -----------------
 * The thing this screen exists for is a total that is wrong but plausible. OCR
 * reading 24,90 as 2490 produces a number nothing about its appearance betrays,
 * and a red tint on a filled-in field does not help: a filled-in field gets
 * approved at a glance whatever colour it is.
 *
 * So a contradicted total does not arrive as a value at all. The amount box is
 * empty, the way it already is when no amount could be found, and what was read
 * is offered as a choice beside what the arithmetic says it should have been.
 * An empty box cannot be skimmed past. That is the same move as the empty date
 * box, and for the same reason.
 *
 * `unverified` gets its own treatment for a smaller but related reason: "we read
 * a number" and "we checked a number" are different claims, and showing them
 * identically states the first as though it were the second.
 */

/**
 * What to say about the total, led by *which kind* of thing happened.
 *
 * The heading is separate from the explanation because the two blank cases were
 * reported as indistinguishable. They both leave the amount box empty, and the
 * difference between them was buried in a sentence: one means nothing on the
 * page said what the total was, the other means something did and the arithmetic
 * disagrees with it. Those are different situations calling for different things
 * from the person reading — hunt for the figure, or adjudicate between two of
 * them — so the difference now leads.
 */
function verdictLabel(verdict: TotalVerdict): {
  heading: string;
  text: string;
  className: string;
} {
  switch (verdict.kind) {
    case "corroborated":
      return {
        heading: "Total checked",
        text: `${verdict.by}.`,
        className: "bg-slate-50 text-slate-600",
      };
    case "unverified":
      return {
        // Amber, and it is the only place in this project that uses a third
        // colour. The whole design turns on these states being told apart at a
        // glance, and grey against grey is not telling them apart.
        heading: "Total not checked",
        text: verdict.why,
        className: "bg-amber-50 text-amber-800",
      };
    case "contradicted":
      return {
        heading: `Total read as ${verdict.read.toFixed(2)}, and that looks wrong`,
        text: `${verdict.problem}. Nothing has been filled in — choose below, or type the right figure.`,
        className: "bg-red-50 text-red-700",
      };
    case "absent":
      return {
        heading: "No total found",
        text: `${verdict.why} Read it off the photo and type it in.`,
        className: "bg-red-50 text-red-700",
      };
  }
}

export function ReceiptReview({
  receipt,
  suggestion,
  words,
  imageUrl,
  imageWidth,
  imageHeight,
  saving,
  showCurrency,
  categories,
  onSave,
  onDiscard,
}: {
  receipt: ReceiptData;
  suggestion: Suggestion;
  words: WordBox[];
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  saving: boolean;
  showCurrency: boolean;
  categories: string[];
  onSave: (expense: NewExpense) => void;
  onDiscard: () => void;
}) {
  const [values, setValues] = useState<ExpenseFieldValues>({
    // Empty whenever the total was contradicted or missing — see the note above.
    amount: suggestion.amount?.toString() ?? "",
    currency: suggestion.currency,
    merchant: suggestion.merchant ?? "",
    category: suggestion.category,
    expenseDate: suggestion.expenseDate ?? "",
    note: suggestion.description ?? "",
  });

  const amountUsable = amountIsUsable(values.amount);
  const dateUsable = values.expenseDate !== "";
  const usable = amountUsable && dateUsable;

  const verdict = receipt.verdict;
  const label = verdictLabel(verdict);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!usable || saving) return;

    onSave({
      amount: parseAmount(values.amount),
      currency: values.currency,
      merchant: values.merchant.trim() || null,
      category: values.category,
      description: values.note.trim() || null,
      expenseDate: values.expenseDate,
    });
  }

  const choose = (amount: number) =>
    setValues((current) => ({ ...current, amount: amount.toFixed(2) }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-slate-900">Check this against the photo</h2>
        <p className="text-sm text-slate-500">
          Nothing has been saved yet. The photo stays on your device — it is never uploaded.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <ReceiptImage
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          words={words}
          marked={[
            {
              label: "Total",
              source: receipt.sources.total,
              // Marked in red when it is the value being questioned, so the eye
              // goes to the thing that needs looking at rather than to the
              // fields, which cannot tell you anything the photo cannot.
              tone: verdict.kind === "contradicted" ? "doubted" : "read",
            },
            { label: "Date", source: receipt.sources.date, tone: "read" },
            { label: "Shop", source: receipt.sources.merchant, tone: "read" },
          ]}
        />

        <div className="space-y-4">
          <div className={`rounded-lg px-4 py-3 text-sm ${label.className}`} data-verdict={verdict.kind}>
            <p className="font-medium">{label.heading}</p>
            <p>{label.text}</p>
          </div>

          {/*
            Both readings, as choices.

            When the arithmetic caught the error it usually also says what the
            right answer was — the lines add up to something, and that something
            is a better figure than the one that was read. Offering both beats
            clearing the box to nothing, and either beats filling one in
            silently. Neither is preselected: picking one is the person's, and
            the whole point is that they look at the photo first.
          */}
          {verdict.kind === "contradicted" && (
            <div className="flex flex-wrap items-center gap-2">
              {verdict.suggested !== null && (
                <button
                  type="button"
                  onClick={() => choose(verdict.suggested!)}
                  className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-900 ring-1 ring-slate-300 transition hover:ring-accent"
                >
                  Use {verdict.suggested.toFixed(2)} — what it adds up to
                </button>
              )}
              <button
                type="button"
                onClick={() => choose(verdict.read)}
                className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-500 ring-1 ring-slate-300 transition hover:ring-accent"
              >
                Use {verdict.read.toFixed(2)} — what was printed
              </button>
            </div>
          )}

          <ExpenseFields
            values={values}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
            autoFocusAmount={suggestion.amount === null}
            autoFocusDate={suggestion.amount !== null && suggestion.expenseDate === null}
            flagDate={suggestion.expenseDate === null && values.expenseDate === ""}
            showCurrency={showCurrency}
            categories={categories}
          />

          {/*
            Said again beside the empty box, not only at the top.

            An empty amount is the right answer to both "no number was found" and
            "a number was found and disputed", and the reported problem was that
            they looked identical from here. The banner above leads with which is
            which; this repeats it where the eye actually is, which is the box
            that needs filling.
          */}
          {!amountUsable && (
            <p className="text-sm text-slate-500">
              {verdict.kind === "contradicted"
                ? `Left blank on purpose: ${verdict.read.toFixed(2)} was read and does not add up.`
                : verdict.kind === "absent"
                  ? "Left blank because no total was found on the receipt at all."
                  : suggestion.amount === null
                    ? "Fill in the total from the receipt to save it."
                    : "Enter an amount greater than zero."}
            </p>
          )}

          {receipt.items.length > 0 && (
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer text-slate-600">
                {receipt.items.length} {receipt.items.length === 1 ? "line" : "lines"} read from the
                receipt
              </summary>
              {/*
                Not stored anywhere — there is no table for them and the build
                plan is emphatic about not adding one. They are here because they
                are the evidence behind the verdict: "the lines add up to 24,90"
                is a claim, and this is the claim's working shown.
              */}
              <ul className="mt-2 space-y-1">
                {receipt.items.map((item, index) => (
                  <li key={`${item.description}-${index}`} className="flex justify-between gap-4">
                    <span className="truncate">{item.description ?? "Unnamed"}</span>
                    <span className="shrink-0 tabular-nums">{item.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!usable || saving}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save expense"}
        </button>

        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg px-3 py-2.5 text-sm text-slate-500 transition hover:text-slate-800"
        >
          Discard
        </button>

        <span className="ml-auto text-xs text-slate-400">
          read on this device, {Math.round(receipt.confidence * 100)}% of the receipt understood
        </span>
      </div>
    </form>
  );
}
