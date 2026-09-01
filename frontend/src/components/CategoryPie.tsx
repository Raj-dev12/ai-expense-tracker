import { useEffect, useRef } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CategorySlice, Expense } from "../api";
import { formatDayMonth, formatMoney, formatMonth } from "../format";

/**
 * The first six slots of the validated categorical palette, in order.
 *
 * The order is the colourblind-safety mechanism rather than a matter of taste,
 * so slots are assigned in sequence and never cycled.
 */
const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];

const MAX_SLICES = 6;

/**
 * A slice of the pie, and the categories it actually stands for.
 *
 * `members` is the fix for a bug worth remembering. A folded slice used to
 * carry only the name "Other", so the tooltip described five categories summed
 * together while clicking it fetched the one real category of that name — the
 * two disagreed about the same slice, which is worse than either being wrong on
 * its own. A slice now knows what it is made of, and everything that reads a
 * slice reads the same list.
 *
 * For an unfolded slice `members` is the single category, so there is no branch
 * anywhere else.
 */
export type PieSlice = CategorySlice & { members: string[] };

/** True when this slice is a group of categories rather than one of them. */
export function isGroup(slice: PieSlice): boolean {
  return slice.members.length > 1;
}

/**
 * What to call a slice on screen.
 *
 * A group says so. "Other" alone is indistinguishable from the real category of
 * that name — and when a real "Other" is among the largest it is merged into
 * the group, so the label has to admit it is standing for several things.
 */
export function sliceLabel(slice: PieSlice): string {
  return isGroup(slice) ? `${slice.category} · ${slice.members.length} categories` : slice.category;
}

/**
 * Fold everything past the fifth category into a single "Other" slice.
 *
 * A pie is only readable at a glance with about six segments; past that,
 * adjacent slices blur and the colours run out of separation. Nine categories
 * would be a table, not a pie. If a real "Other" category is already among the
 * largest, the folded remainder merges into it rather than producing two slices
 * with the same name.
 *
 * The invariant that matters, and the one the checks pin: a slice's total is
 * always the sum of the categories in its `members`. Break that and the chart
 * and the panel below it stop describing the same expenses.
 */
export function foldToSixSlices(categories: CategorySlice[]): PieSlice[] {
  const own = (slice: CategorySlice): PieSlice => ({ ...slice, members: [slice.category] });

  if (categories.length <= MAX_SLICES) return categories.map(own);

  const kept = categories.slice(0, MAX_SLICES - 1).map(own);
  const folded = categories.slice(MAX_SLICES - 1);

  const total = folded.reduce((sum, slice) => sum + Number(slice.totalBase), 0);
  const count = folded.reduce((sum, slice) => sum + slice.count, 0);
  const names = folded.map((slice) => slice.category);

  const existing = kept.findIndex((slice) => slice.category === "Other");
  if (existing >= 0) {
    const current = kept[existing]!;
    kept[existing] = {
      category: "Other",
      totalBase: (Number(current.totalBase) + total).toFixed(2),
      count: current.count + count,
      // The real "Other" first, then everything folded into it. Its own name
      // has to be in here or the panel would leave its expenses out.
      members: [...current.members, ...names],
    };
    return kept;
  }

  return [...kept, { category: "Other", totalBase: total.toFixed(2), count, members: names }];
}

type Slice = PieSlice & { colour: string; share: number };

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
  currency: string;
}) {
  const slice = active ? payload?.[0]?.payload : undefined;
  if (!slice) return null;

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="font-medium text-slate-900">{sliceLabel(slice)}</p>
      <p className="text-slate-500">
        {formatMoney(slice.totalBase, currency)} · {slice.share}% · {slice.count}{" "}
        {slice.count === 1 ? "expense" : "expenses"}
      </p>
      {/*
        A group names what is inside it. Without this a real category can vanish
        from the chart entirely — folded into a slice that never mentions it —
        while the query box still answers questions about it by name. Two parts
        of one page describing the same spending differently is what makes the
        numbers hard to trust.
      */}
      {isGroup(slice) && (
        <p className="mt-1 max-w-56 text-xs text-slate-400">{slice.members.join(", ")}</p>
      )}
    </div>
  );
}

export function CategoryPie({
  categories,
  from,
  currency,
  selected,
  selectedExpenses,
  selectedLoading,
  onSelect,
  onDismiss,
}: {
  categories: CategorySlice[];
  from: string;
  currency: string;
  /** The slice whose expenses are open below the chart, if any. */
  selected: PieSlice | null;
  selectedExpenses: Expense[];
  selectedLoading: boolean;
  onSelect: (slice: PieSlice) => void;
  onDismiss: () => void;
}) {
  const card = useRef<HTMLElement>(null);

  /**
   * Clicking anywhere outside this card closes the panel.
   *
   * Deliberately not hover. A panel that vanishes when the mouse drifts off it
   * cannot be read to the end, cannot be scrolled, and does not exist at all on
   * a touchscreen. Clicking to open and clicking away to close is the same
   * contract a menu has, and it works with a finger.
   *
   * The listener is on pointerdown rather than click so it fires before focus
   * moves, and it ignores clicks inside the card so that picking a different
   * slice switches the panel instead of closing it.
   */
  useEffect(() => {
    if (!selected) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selected, onDismiss]);

  const slices = foldToSixSlices(categories);
  const total = slices.reduce((sum, slice) => sum + Number(slice.totalBase), 0);

  const data: Slice[] = slices.map((slice, index) => ({
    ...slice,
    colour: SERIES[index] ?? SERIES[SERIES.length - 1]!,
    share: total > 0 ? Math.round((Number(slice.totalBase) / total) * 100) : 0,
  }));

  return (
    <section ref={card} className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-4">
        <h2 className="text-base font-medium text-slate-900">Where it went</h2>
        <p className="text-xs text-slate-400">{formatMonth(from)}, by category</p>
      </header>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Nothing recorded this month yet.
        </p>
      ) : (
        <div className="@container">
          {/*
            The legend sits beside the pie only when this card is wide enough for
            it — a question about the card, not about the window.

            It used to ask `sm:`, a viewport breakpoint. On a wide screen that
            fires, and the card is simultaneously narrower, because the two
            charts then sit side by side in a two-column grid: 416px of card,
            208 of it taken by the pie. The names were squeezed to nothing and
            silently truncated to a single letter. A container query asks the
            only question that matters — how much room is there in here — so the
            legend drops below the pie whenever it needs the width.
          */}
          <div className="flex flex-col gap-6 @xl:flex-row @xl:items-center">
            <div className="h-52 w-full @xl:w-52 @xl:shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey={(slice: Slice) => Number(slice.totalBase)}
                    nameKey="category"
                    innerRadius="55%"
                    outerRadius="100%"
                    // A 2px gap in the surface colour separates the slices,
                    // rather than a border drawn around each one.
                    stroke="var(--chart-surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    // Recharts hands the datum straight back, so the slice
                    // arrives whole — its member categories included — and
                    // nothing has to be looked up by name afterwards. Passing
                    // the name alone is what let the panel ask a different
                    // question from the one the tooltip answered.
                    onClick={(entry: unknown) => {
                      const slice = entry as Partial<Slice>;
                      if (slice.category && slice.members) onSelect(slice as Slice);
                    }}
                    className="cursor-pointer"
                  >
                    {data.map((slice) => (
                      <Cell key={slice.category} fill={slice.colour} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/*
              The legend is not decoration. Three of these colours sit below the
              contrast threshold against white, so the name and the amount are
              always written out — colour never carries the meaning by itself,
              and every value is readable without hovering anything.

              Nothing here truncates. A name that will not fit is a layout
              problem to be solved by giving it room, not hidden by clipping the
              word: silent truncation is exactly how "Bills" became "B" while
              everything else appeared to be fine. The amount and the share never
              shrink, so the name keeps whatever room is left.
            */}
            <ul className="min-w-0 flex-1 space-y-2">
              {data.map((slice) => (
                <li key={slice.category}>
                  {/* A button rather than a clickable li: a slice of an SVG pie
                      cannot be reached with a keyboard, so the legend is the
                      route that can. Same action, same panel. */}
                  <button
                    type="button"
                    onClick={() => onSelect(slice)}
                    aria-expanded={selected?.category === slice.category}
                    className={[
                      "flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left text-sm transition",
                      selected?.category === slice.category ? "bg-slate-100" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.colour }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-slate-700">{sliceLabel(slice)}</span>
                      {/*
                        The members, written out. A folded slice otherwise hides
                        real categories completely — they are absent from the
                        chart while the query box still answers questions about
                        them by name, and a reader has no way to tell where they
                        went. Nothing truncates here for the same reason nothing
                        else does.
                      */}
                      {isGroup(slice) && (
                        <span className="block text-xs text-slate-400">
                          {slice.members.join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">
                      {formatMoney(slice.totalBase, currency)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">
                      {slice.share}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="mt-2 rounded-xl bg-slate-50 p-4">
              <header className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-900">
                  {sliceLabel(selected)} · {formatMonth(from)}
                </h3>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded px-2 py-1 text-xs text-slate-400 transition hover:text-slate-800"
                >
                  Close
                </button>
              </header>

              {selectedLoading ? (
                <p className="py-4 text-sm text-slate-400">Loading...</p>
              ) : selectedExpenses.length === 0 ? (
                <p className="py-4 text-sm text-slate-400">Nothing in this category.</p>
              ) : (
                // Its own scroll box: a category with forty expenses in it would
                // otherwise push the trend chart off the screen.
                <ul className="max-h-56 divide-y divide-slate-200 overflow-y-auto">
                  {selectedExpenses.map((expense) => (
                    <li key={expense.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {expense.merchant ?? expense.description ?? "Unnamed expense"}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatDayMonth(expense.expenseDate)}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-900">
                        {formatMoney(expense.amountBase, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
