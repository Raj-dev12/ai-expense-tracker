import { useId, type ReactNode } from "react";

/**
 * The chrome every card on the page shares, written once.
 *
 * It was the same string copied into seven components, which was survivable
 * while it never changed and became seven edits the moment the page got denser.
 * A card is white, has a thin ring instead of a shadow, and is padded evenly —
 * one definition, imported.
 *
 * The padding and the corner radius both came down when the page went to two
 * columns: `p-6`/`rounded-2xl` were chosen for a page with three sections on it.
 * See the decisions table.
 */
export const CARD = "rounded-xl bg-white p-5 ring-1 ring-slate-200";

/**
 * A card whose body can be folded away.
 *
 * The header never folds. A collapsed panel still says what it is and how much
 * is inside — "Expenses · 92 expenses" — so a closed box is a labelled strip
 * rather than a blank one. That is the whole answer to the obvious objection to
 * remembering the state across visits: somebody who closed four panels a
 * fortnight ago comes back to a page that tells them what they closed.
 *
 * `controls` is for anything that has to stay reachable whether the body is open
 * or shut. The analysis card puts its period dropdown there, because that
 * dropdown governs the entire page — a global control that hides itself is a bad
 * control.
 */
export function CollapsiblePanel({
  id,
  title,
  note,
  summary,
  controls,
  open,
  onToggle,
  children,
}: {
  /**
   * Which panel this is, written into the markup as `data-panel`.
   *
   * Not for styling and not for the person using the page — it is a stable
   * handle for the end-to-end checks. They used to find a panel by the words in
   * its heading, which meant looking for "September" to find the day panel: a
   * check that would have started failing in October, and one that could not
   * tell one open panel from another. Naming the thing is cheaper than guessing
   * at it, and it is the same reason the calendar cells carry their date in an
   * `aria-label`.
   */
  id: string;
  title: string;
  /** The quiet line under the title while the panel is open. */
  note?: ReactNode;
  /** What to say instead while it is closed. Falls back to `note`. */
  summary?: ReactNode;
  /** Stays visible either way. */
  controls?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  // React generates the pair of matching ids, so the button can name the region
  // it controls without the page having to invent unique strings by hand.
  const bodyId = useId();

  return (
    <section data-panel={id} className={CARD}>
      <header className={`flex flex-wrap items-baseline justify-between gap-3 ${open ? "mb-3" : ""}`}>
        {/*
          The whole title is the control, not a separate icon beside it. A
          six-pixel chevron is a poor target with a finger and an easy thing to
          miss with a mouse, and there is nothing else the title could usefully
          do when clicked.
        */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex min-w-0 items-baseline gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden className="text-xs text-slate-300 transition group-hover:text-slate-500">
            {open ? "▾" : "▸"}
          </span>
          <h2 className="text-sm font-medium text-slate-900">{title}</h2>
          <span className="truncate text-xs text-slate-400">{open ? note : (summary ?? note)}</span>
        </button>

        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </header>

      {/*
        Unmounted rather than hidden with CSS. A closed panel should not be
        holding a half-typed question or an open row editor that reappears
        unannounced later, and there is nothing here whose state is expensive
        enough to be worth preserving.
      */}
      {open && <div id={bodyId}>{children}</div>}
    </section>
  );
}
