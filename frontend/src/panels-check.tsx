/**
 * Drives the folding panels against the real backend and a real localStorage.
 *
 * Two things here cannot be seen by rendering a component to a string, which is
 * why they are checked in a browser-shaped environment instead:
 *
 * - **The force-open rule.** The calendar is the only way to reach a day, so
 *   clicking a date while the day panel is folded away has to unfold it. A click
 *   that appears to do nothing is the feature appearing to do nothing.
 * - **Persistence.** Whether a folded panel is still folded after a reload is a
 *   claim about something outside the component tree, and the only honest way to
 *   test it is to throw the whole tree away and build it again.
 *
 * Panels are found by `data-panel`, never by the words in their heading. The
 * first draft of this file looked for "September" to find the day panel — a
 * check that would have started failing in October — and asked "is some panel
 * open" where it meant "is this one open", which passed happily while the panel
 * under test stayed shut.
 */
import { act, container, mount, press, report, settle, unmount, window } from "./check-harness";

await mount();

function panel(id: string): HTMLElement {
  const found = container.querySelector(`[data-panel="${id}"]`);
  if (!found) throw new Error(`no panel with data-panel="${id}"`);
  return found as HTMLElement;
}

function toggleFor(id: string): HTMLButtonElement {
  const found = panel(id).querySelector("button[aria-expanded]");
  if (!found) throw new Error(`panel "${id}" has no toggle`);
  return found as HTMLButtonElement;
}

const isOpen = (id: string) => toggleFor(id).getAttribute("aria-expanded") === "true";
const headerOf = (id: string) => (toggleFor(id).textContent ?? "").replace(/^[▾▸]/, "").trim();

function dayCells(): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter((button) =>
    /^\d{4}-\d{2}-\d{2}$/.test(button.getAttribute("aria-label") ?? ""),
  ) as HTMLButtonElement[];
}

const STORAGE_KEY = "expense-tracker.collapsed";
const stored = () => window.localStorage.getItem(STORAGE_KEY);

// 1. What a first-time visitor lands on. This is the whole reason the defaults
// are what they are: a panel starts closed only if it is a tool you go looking
// for, never if it is information you would read.
report("first visit: the expenses list is open", isOpen("recent"));
report("first visit: the day's expenses are open", isOpen("day"));
report("first visit: the analysis card is open", isOpen("analysis"));
report("first visit: the categories panel is closed", !isOpen("categories"));
report("first visit: only one panel is closed", [
  "recent", "day", "analysis", "categories",
].filter((id) => !isOpen(id)).length === 1);
report("first visit: nothing has been written to storage yet", stored() === null);

// The charts and the calendar are not collapsible at all: a chart's whole value
// is being read without being asked for.
//
// Counted as panels, not as buttons carrying `aria-expanded`. The looser version
// expected four and found nine, because every row of the pie legend carries that
// attribute too for the drill-down it opens — a check that asked "how many things
// on this page expand" when it meant "how many panels fold".
report(
  "exactly four panels fold",
  container.querySelectorAll("[data-panel]").length === 4,
  `${container.querySelectorAll("[data-panel]").length} panels`,
);
report(
  "the calendar is not one of them",
  dayCells()[0]!.closest("section")!.hasAttribute("data-panel") === false,
);
report(
  "neither is the pie",
  [...container.querySelectorAll("section")]
    .find((section) => (section.textContent ?? "").includes("Where it went"))!
    .hasAttribute("data-panel") === false,
);

// 2. Folding a panel writes that, and only that.
await press(toggleFor("recent"));
report("folding a panel closes it", !isOpen("recent"));
report("folding a panel drops its rows", panel("recent").querySelector("ul") === null);
report("a folded panel still says what is inside", /\d+ expenses/.test(headerOf("recent")), headerOf("recent"));
report("folding a panel is remembered", stored() === '["categories","recent"]', stored() ?? "nothing");
report("folding one panel leaves the others alone", isOpen("day") && isOpen("analysis"));

// 3. The period control survives its own panel being folded away. It governs
// every number on the page, so this is the one that would matter most.
await press(toggleFor("analysis"));
report("the analysis card can be folded", !isOpen("analysis"));
report(
  "a folded analysis card keeps its period control",
  panel("analysis").querySelector('button[aria-label="Previous period"]') !== null,
);
report(
  "a folded analysis card keeps its Summarise button",
  (panel("analysis").textContent ?? "").includes("Summarise"),
);
report(
  "a folded analysis card drops its question box",
  panel("analysis").querySelector("form") === null,
);
await press(toggleFor("analysis"));

// 4. The force-open rule.
await press(toggleFor("day"));
report("the day panel can be folded away", !isOpen("day"));

const target = dayCells().find((cell) => cell.getAttribute("aria-current") !== "date")!;
const targetDate = target.getAttribute("aria-label")!;
await press(target);

report("clicking a date unfolds the day panel", isOpen("day"), targetDate);
report(
  "and the panel underneath is showing that day",
  headerOf("day").length > 0 && !(panel("day").textContent ?? "").includes("▸"),
  headerOf("day"),
);
// Forcing it open is a change to the same state everything else writes, so it
// is remembered like any other.
report("the forced-open day is remembered", !(stored() ?? "").includes('"day"'), stored() ?? "nothing");

// 5. Persistence. Throw the entire tree away and build it again — the closest
// this harness gets to a reload.
const before = stored();
await unmount();
await mount();

report("after a reload: storage is unchanged", stored() === before, stored() ?? "nothing");
report("after a reload: the folded panel is still folded", !isOpen("recent"));
report("after a reload: the categories panel is still closed", !isOpen("categories"));
report("after a reload: the panels left open are still open", isOpen("day") && isOpen("analysis"));

// 6. Nonsense in storage costs you your layout, not the page.
for (const nonsense of ["{{{ not json", '{"recent":true}', '["a-panel-that-was-removed"]']) {
  window.localStorage.setItem(STORAGE_KEY, nonsense);
  await unmount();
  await mount();
  report(
    `storage holding ${nonsense} does not break the page`,
    (container.textContent ?? "").includes("Expense tracker") && dayCells().length > 0,
  );
}
// The last of those is a list that parses but names nothing real. Its entry is
// dropped rather than treated as an error, which leaves every panel open —
// including the one that starts closed. That is the intended trade: renaming a
// panel later forgets one line of somebody's layout instead of resetting it.
report("an unknown panel id is forgotten, not fatal", isOpen("categories"));

// 7. Unfolding writes the removal back, so that change survives too.
window.localStorage.removeItem(STORAGE_KEY);
await unmount();
await mount();
await press(toggleFor("categories"));
report("unfolding a panel is remembered as well", stored() === "[]", stored() ?? "nothing");

window.localStorage.removeItem(STORAGE_KEY);
await act(async () => {});
await settle();
process.exit(process.exitCode ?? 0);
