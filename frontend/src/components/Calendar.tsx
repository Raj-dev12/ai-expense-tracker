import type { DailyTotal } from "../api";
import {
  WEEKDAY_NAMES,
  dayNumber,
  isInMonth,
  monthGrid,
  shiftMonth,
  startOfMonth,
} from "../calendar";
import { formatMonthYear, formatMoney } from "../format";
import { CARD } from "./Panel";

/**
 * A month at a glance, and the only way to choose a day.
 *
 * The totals it draws come from `GET /api/analytics/daily` rather than from
 * adding up a month of expenses in the browser. That mirrors the pie, which has
 * the same two halves: an endpoint for the aggregate, and plain `GET
 * /api/expenses` for the rows behind whatever you click. Summing here would put
 * a second definition of "what you spent" in the app, and it would have to be
 * done in floating point — the thing the decimal column exists to avoid.
 *
 * Its month is its own state, independent of the dashboard's period stepper, so
 * it says which month it is showing in its heading. Without that, a page showing
 * July above a calendar showing September looks like a contradiction rather than
 * two controls doing two jobs.
 */
export function Calendar({
  month,
  days,
  selected,
  today,
  currency,
  loading,
  onMonthChange,
  onSelect,
}: {
  /** The first of the month being shown. */
  month: string;
  days: DailyTotal[];
  selected: string;
  today: string;
  currency: string;
  loading: boolean;
  onMonthChange: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  // A lookup rather than a find per cell: forty-two cells searching a list of
  // thirty is quadratic for no reason, and the map is built once per render.
  const totals = new Map(days.map((day) => [day.date, day]));

  /**
   * The forward arrow stops at the month containing today, the same way the
   * period stepper's does. There is no spending in the future, and a calendar
   * that walks into empty months invites the question of why they are empty.
   */
  const thisMonth = startOfMonth(today);
  const canGoForward = month < thisMonth;

  const arrow = (by: -1 | 1, label: string, glyph: string) => {
    const enabled = by === -1 || canGoForward;
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={!enabled}
        onClick={() => onMonthChange(shiftMonth(month, by))}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {glyph}
      </button>
    );
  };

  return (
    <section className={CARD}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-900">{formatMonthYear(month)}</h2>
          <p className="text-xs text-slate-400">
            {loading ? "Loading..." : "Pick a day to see what was spent on it"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {arrow(-1, "Previous month", "‹")}
          {arrow(1, "Next month", "›")}
        </div>
      </header>

      {/*
        The grid scrolls sideways on a narrow screen rather than being squeezed,
        which is what the day table below already does with its columns.

        Seven columns is seven columns whatever the screen is. On a phone that
        leaves each cell about twenty-five pixels of room for its text, and
        "€42.60" needs roughly forty — so the amounts would be clipped while
        still being present in the markup. That is precisely how the pie legend
        showed "B" for "Bills" and passed every check while doing it. The minimum
        width keeps a cell wide enough for an amount; below that the grid moves
        instead of the text disappearing.
      */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-1">
          {WEEKDAY_NAMES.map((name) => (
            <div key={name} className="pb-1 text-center text-xs font-medium text-slate-400">
              {name}
            </div>
          ))}

          {monthGrid(month).map((date) => {
            const inMonth = isInMonth(date, month);
            const total = totals.get(date);

            // Days from the months either side are shown, faintly, rather than
            // left blank — the grid keeps its shape at the corners and the start
            // of the month is visible without counting. They are inert: a
            // calendar that let you click into a month it is not totalling would
            // have to decide whether its own heading should follow.
            if (!inMonth) {
              return (
                <div
                  key={date}
                  aria-hidden="true"
                  className="min-h-14 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                >
                  {dayNumber(date)}
                </div>
              );
            }

            const isSelected = date === selected;
            const isToday = date === today;

            return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                aria-label={date}
                aria-current={isSelected ? "date" : undefined}
                className={[
                  "min-h-14 rounded-lg px-2 py-1.5 text-left transition",
                  isSelected
                    ? "bg-accent text-white"
                    : "text-slate-900 hover:bg-slate-50 ring-1 ring-transparent hover:ring-slate-200",
                  // Today is ringed rather than filled, so it can be told apart
                  // from the day that is actually selected.
                  isToday && !isSelected ? "ring-1 ring-accent" : "",
                ].join(" ")}
              >
                <span
                  className={`block text-xs ${isSelected ? "text-white/80" : isToday ? "font-medium text-accent" : "text-slate-400"}`}
                >
                  {dayNumber(date)}
                </span>

                {/*
                  A day with nothing in it shows its number and nothing else. Twenty
                  cells reading "€0.00" look like data and bury the days that have
                  something in them; a blank cell says "nothing happened" faster.
                  It stays clickable, because checking that a quiet day really was
                  quiet is a normal thing to do, and a cell that ignores a click
                  reads as broken.
                */}
                {total && (
                  <span
                    className={`mt-0.5 block text-xs tabular-nums ${isSelected ? "text-white" : "text-slate-700"}`}
                  >
                    {formatMoney(total.totalBase, currency)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
