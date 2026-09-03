import {
  PERIODS,
  PERIOD_LABELS,
  canStepForward,
  selectionLabel,
  step,
  windowForSelection,
  type Period,
  type Selection,
} from "../periods";
import { formatDayMonth } from "../format";

/**
 * Which window the dashboard is looking at: how long, and which one.
 *
 * Two controls doing two jobs. The dropdown chooses the *size* of the block —
 * a week, a month, a quarter — and the arrows choose *which* block of that
 * size. Separating them is what makes "the July I mean" reachable without
 * fourteen entries in one menu.
 *
 * The forward arrow stops at the present rather than wrapping. There is no
 * spending in the future, and a control that walks into empty months invites
 * the question of why they are empty.
 *
 * Custom ranges have no arrows. Stepping one would have to invent a stride —
 * its own length? a month? — and every answer is a guess about what somebody
 * who typed two exact dates wanted next. They can type two more.
 */
export function PeriodPicker({
  selection,
  onChange,
  today,
}: {
  selection: Selection;
  onChange: (next: Selection) => void;
  today?: string;
}) {
  const window = windowForSelection(selection, today);
  const stepping = selection.kind === "period";

  const onSelect = (value: string) => {
    if (value === "custom") {
      // Seeded with the window currently on screen, so the range starts from
      // something the person was already looking at rather than from blank
      // boxes they have to fill before anything happens.
      onChange({ kind: "custom", from: window.from, to: window.to });
      return;
    }
    onChange({ kind: "period", period: value as Period, offset: 0 });
  };

  const arrow = (direction: -1 | 1, label: string, glyph: string) => {
    const enabled = stepping && (direction === -1 || canStepForward(selection));
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={!enabled}
        onClick={() => onChange(step(selection, direction))}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {glyph}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selection.kind === "custom" ? "custom" : selection.period}
        onChange={(event) => onSelect(event.target.value)}
        className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-900 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-accent"
      >
        {PERIODS.map((name) => (
          <option key={name} value={name}>
            {PERIOD_LABELS[name]}
          </option>
        ))}
        <option value="custom">Custom range</option>
      </select>

      {stepping && (
        <div className="flex items-center gap-1">
          {arrow(-1, "Previous period", "‹")}
          {arrow(1, "Next period", "›")}
        </div>
      )}

      {selection.kind === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <input
            type="date"
            value={selection.from}
            // The end never moves backwards past the start. Left free, a range
            // typed end-first would spend a keystroke or two describing a
            // window that runs backwards, and the charts would empty out for a
            // reason nobody could see.
            max={selection.to}
            onChange={(event) =>
              event.target.value && onChange({ ...selection, from: event.target.value })
            }
            aria-label="From"
            className="rounded-lg bg-white px-2 py-1 text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-accent"
          />
          <span>to</span>
          <input
            type="date"
            value={selection.to}
            min={selection.from}
            onChange={(event) =>
              event.target.value && onChange({ ...selection, to: event.target.value })
            }
            aria-label="To"
            className="rounded-lg bg-white px-2 py-1 text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}

      {/*
        The exact dates, always. The label above says "August 2026" or "This
        month", and neither of those tells you where a partial period actually
        stops — the current block runs to today, a stepped one runs to the end
        of its month. Writing the two dates out means nothing has to be inferred
        from the name.
      */}
      <span className="text-xs text-slate-400">
        {formatDayMonth(window.from)} – {formatDayMonth(window.to)}
      </span>
    </div>
  );
}

/** The window's name, for a heading. Exported so the card above can say it too. */
export function labelFor(selection: Selection, today?: string): string {
  return selectionLabel(selection, today);
}
