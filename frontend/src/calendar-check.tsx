/**
 * Drives the calendar against the real backend.
 *
 * The day view lost its date picker, so the calendar is now the only way to
 * reach a day at all. That makes the wiring between the two the thing most worth
 * checking end to end: if a click does not land, the day view is not merely
 * awkward, it is unreachable — and nothing in the render checks would notice,
 * because each component renders perfectly well on its own.
 *
 * The jsdom setup and the real-backend fetch live in check-harness.tsx, which
 * panels-check.tsx uses too. The backend is the real one for the reason that
 * file gives: a stubbed backend only ever proves the stub agrees with the
 * frontend.
 */
import { container, mount, press, report, requested } from "./check-harness";

await mount();

/** A section picked out by the heading it carries. */
function sectionContaining(text: string): HTMLElement {
  const found = [...container.querySelectorAll("section")].find((s) =>
    (s.querySelector("h2")?.textContent ?? "").includes(text),
  );
  if (!found) throw new Error(`no section headed with "${text}"`);
  return found as HTMLElement;
}

/** The calendar is the section whose grid holds date-labelled buttons. */
function calendar(): HTMLElement {
  const found = [...container.querySelectorAll("section")].find((s) =>
    s.querySelector('button[aria-label^="20"]'),
  );
  if (!found) throw new Error("the calendar is not on the page");
  return found as HTMLElement;
}

function dayCells(): HTMLButtonElement[] {
  return [...calendar().querySelectorAll("button")].filter((b) =>
    /^\d{4}-\d{2}-\d{2}$/.test(b.getAttribute("aria-label") ?? ""),
  ) as HTMLButtonElement[];
}

function arrow(label: string): HTMLButtonElement {
  const found = calendar().querySelector(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`no ${label} arrow`);
  return found as HTMLButtonElement;
}

/** The day view is the one section that holds a table of expenses. */
function dayView(): HTMLElement {
  const found = [...container.querySelectorAll("section")].find(
    (s) => s.querySelector("table") || (s.textContent ?? "").includes("Nothing spent on this day"),
  );
  if (!found) throw new Error("the day view is not on the page");
  return found as HTMLElement;
}

// 1. The calendar is there, and it is the only date control left.
report("the calendar is on the page", dayCells().length >= 28, `${dayCells().length} day cells`);
report(
  "the day view has no date picker of its own",
  dayView().querySelector('input[type="date"]') === null,
);
report(
  "the calendar draws whole weeks",
  calendar().querySelectorAll('[aria-hidden="true"]').length + dayCells().length === 42,
);

// 2. It asked the endpoint for its totals rather than adding up a month of rows.
report(
  "the totals come from the daily endpoint",
  requested.some((url) => url.startsWith("/api/analytics/daily")),
  requested.find((url) => url.startsWith("/api/analytics/daily")) ?? "never asked",
);

// 3. Clicking a day with spending in it drives the table below.
const withSpending = dayCells().filter((cell) => /[€£$]/.test(cell.textContent ?? ""));
report("some days show a total", withSpending.length > 0, `${withSpending.length} of ${dayCells().length}`);

if (withSpending.length > 0) {
  const cell = withSpending[0]!;
  const date = cell.getAttribute("aria-label")!;
  // "3€42.60" — the day number, then the amount.
  const amount = (cell.textContent ?? "").replace(/^\d+/, "").trim();

  await press(cell);

  const shown = dayView().textContent ?? "";
  const day = Number(date.slice(8, 10));
  report("clicking a day names it in the table", shown.includes(String(day)), `${date} → ${shown.slice(0, 40)}`);
  report("the table holds that day's expenses", shown.includes("Total"));
  // The grid's number and the table's footer are computed by different code in
  // different places. This is the check that they agree.
  report("the grid's total and the table's total agree", shown.includes(amount), `cell said ${amount}`);
  report("the clicked day is the selected one", cell.getAttribute("aria-current") === "date");
  // A day is a range whose ends match, which is why clicking one needs no
  // endpoint of its own. Matched on the parameters rather than on the whole
  // string: the order they are built in is not something this should pin.
  const asked = requested.find(
    (url) =>
      url.startsWith("/api/expenses?") && url.includes(`from=${date}`) && url.includes(`to=${date}`),
  );
  report("the day was fetched as a one-day range", asked !== undefined, asked ?? "not asked that way");
}

// 4. Stepping the month leaves the chosen day where it is.
const before = dayView().querySelector("h2")?.textContent ?? "";
const monthBefore = calendar().querySelector("h2")?.textContent ?? "";
const dayRequestsBefore = requested.filter((u) => u.startsWith("/api/expenses?")).length;
await press(arrow("Previous month"));
const monthAfter = calendar().querySelector("h2")?.textContent ?? "";

report("the back arrow moves the calendar", monthBefore !== monthAfter, `${monthBefore} → ${monthAfter}`);
report(
  "the selected day stays put when the month is stepped",
  (dayView().querySelector("h2")?.textContent ?? "") === before,
  `still ${before}`,
);
report(
  "nothing is highlighted in a month the selected day is not in",
  calendar().querySelector('[aria-current="date"]') === null,
);
// The two fetches are separate on purpose: the month's totals did not move
// because you looked at one of its days, and the day did not move because you
// looked at another month.
report(
  "stepping the month did not refetch the day",
  requested.filter((u) => u.startsWith("/api/expenses?")).length === dayRequestsBefore,
  `${requested.filter((u) => u.startsWith("/api/expenses?")).length} vs ${dayRequestsBefore}`,
);
report(
  "stepping the month did fetch the new month's totals",
  requested.filter((u) => u.startsWith("/api/analytics/daily")).length >= 2,
);

// 5. The period stepper is untouched by any of it.
report(
  "the dashboard's own period control is still there",
  container.querySelector('button[aria-label="Previous period"]') !== null,
);

process.exit(process.exitCode ?? 0);
