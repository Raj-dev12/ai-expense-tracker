import { z } from "zod";

/**
 * Which panels can be folded away, and which start that way.
 *
 * The rule behind the list: a panel starts closed only if it is a tool you go
 * looking for, never if it is information you would read. Exactly one qualifies.
 * The charts and the calendar are not collapsible at all — a chart's whole value
 * is being read without being asked for, so a folded chart is one you built and
 * are not using.
 */
export const PANELS = ["analysis", "day", "recent", "categories"] as const;

export type PanelId = (typeof PANELS)[number];

/** Settings, not information. Nobody arrives wanting to rename a category. */
const CLOSED_BY_DEFAULT: PanelId[] = ["categories"];

const STORAGE_KEY = "expense-tracker.collapsed";

/**
 * A list of strings, not a list of known panel ids.
 *
 * `z.array(z.enum(PANELS))` would refuse the whole list because of one entry it
 * did not recognise, so renaming a panel later would reset everybody's layout
 * rather than forgetting one line of it. Unknown ids are filtered out below
 * instead, which is what "ignored rather than an error" has to mean in code.
 */
const storedSchema = z.array(z.string());

function isPanelId(value: string): value is PanelId {
  return (PANELS as readonly string[]).includes(value);
}

/**
 * Which panels are folded, remembered between visits.
 *
 * This is the one piece of state in the app that is stored in the browser rather
 * than the database. It is per-browser and never leaves the machine: no
 * endpoint, no column, nothing the MCP server can see. Folding a panel is a
 * statement about what you care about today, not a fact about your spending.
 *
 * It is still parsed through Zod, because `localStorage` is a boundary like any
 * other — the value there was written by an older version of this code, or by
 * somebody with the developer tools open, and either way it arrives as text of
 * unknown shape. Anything that does not parse falls back to the defaults rather
 * than throwing: a corrupt preference should cost you your layout, not the page.
 */
export function readCollapsed(): Set<PanelId> {
  try {
    // Absent in the render checks, which have no browser around them at all.
    if (typeof localStorage === "undefined") return new Set(CLOSED_BY_DEFAULT);

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set(CLOSED_BY_DEFAULT);

    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return new Set(CLOSED_BY_DEFAULT);

    return new Set(parsed.data.filter(isPanelId));
  } catch {
    // Private browsing can make localStorage itself throw on access, and
    // JSON.parse throws on anything that is not JSON.
    return new Set(CLOSED_BY_DEFAULT);
  }
}

/** Only the closures are written. An open panel is the absence of an entry. */
export function writeCollapsed(collapsed: Set<PanelId>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    // A full or disabled store is not worth breaking a click over.
  }
}
