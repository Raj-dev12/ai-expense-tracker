/**
 * Drives the real add-correct-save-add-again cycle against a fake backend.
 *
 * This exists because the bug it was written to find only appears on the second
 * trip round the loop, which no amount of reading the code made obvious.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost:5173",
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
// Node 24 defines navigator as a getter-only global, so it has to be replaced
// rather than assigned to.
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.Event = dom.window.Event;
g.IS_REACT_ACT_ENVIRONMENT = true;

const { act, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("./App");

// Talks to the REAL backend. A stubbed one only ever proves the stub matches
// the frontend, which is exactly the assumption a response-shape bug breaks.
const BACKEND = "http://localhost:3000";
const realFetch = globalThis.fetch;
const createdIds: string[] = [];

g.fetch = async (url: string, init?: RequestInit) => {
  const response = await realFetch(BACKEND + url, init);
  const clone = response.clone();
  if (url === "/api/expenses" && init?.method === "POST") {
    const body = await clone.json().catch(() => null);
    if (body?.id) createdIds.push(body.id);
  }
  return response;
};


const container = dom.window.document.getElementById("root")!;
const root = createRoot(container);
await act(async () => { root.render(<StrictMode><App /></StrictMode>); });

// A real network call takes longer than a tick, so settle by waiting until the
// page stops saying it is busy rather than by guessing a delay.
const flush = async (): Promise<void> => {
  for (let i = 0; i < 100; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const text = container.textContent ?? "";
    if (!text.includes("Reading...") && !text.includes("Saving...")) return;
  }
  throw new Error("the page never stopped being busy");
};

function addBox(): HTMLInputElement {
  const input = container.querySelector("input:not([type=date])") as HTMLInputElement;
  if (!input) throw new Error("add box not found");
  return input;
}

async function type(text: string) {
  const input = addBox();
  const setValue = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype, "value",
  )!.set!;
  setValue.call(input, text);
  await act(async () => {
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

function buttonLabelled(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === text,
  ) as HTMLButtonElement | undefined;
}

/**
 * Whether the confirm step is on screen.
 *
 * This used to count `<form>` elements and expect two — one for the add box,
 * one for the confirm step. That was true when the page had a single form on
 * it, and quietly stopped being true when the query box and the categories
 * panel arrived with forms of their own. The count could then never be two, so
 * three checks in this file had been failing on every run while asserting
 * nothing about the thing they were named after.
 *
 * Asking for the Save expense button instead names the step directly, and does
 * not move when something unrelated grows another form.
 */
function confirmStepIsOpen(): boolean {
  return buttonLabelled("Save expense") !== undefined;
}

async function pressReadThis() {
  const button = buttonLabelled("Read this");
  if (!button) throw new Error("the Read this button is not on screen");
  if (button.disabled) throw new Error("the Read this button is DISABLED");
  await act(async () => { button.click(); });
  await flush();
}

async function pressSave() {
  const button = buttonLabelled("Save expense");
  if (!button) throw new Error("the Save expense button is not on screen");
  if (button.disabled) throw new Error("the Save expense button is DISABLED");
  await act(async () => { button.click(); });
  await flush();
}

function report(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

function chipValues(): string {
  // Only the confirm step, never the add box — reading the add box made a stale
  // chip look correct, because the sentence it was compared against was there.
  const forms = [...container.querySelectorAll("form")];
  const reviewForm = forms[1];
  if (!reviewForm) return "(confirm step not on screen)";
  return [...reviewForm.querySelectorAll("input, select")]
    .map((i) => (i as HTMLInputElement).value)
    .join(" | ");
}

/** The chips in order: amount, currency, merchant, category, date, note. */
function chip(index: number): string {
  const forms = [...container.querySelectorAll("form")];
  const reviewForm = forms[1];
  if (!reviewForm) return "(confirm step not on screen)";
  const fields = [...reviewForm.querySelectorAll("input, select")];
  return (fields[index] as HTMLInputElement | undefined)?.value ?? "(missing)";
}

// ---- first trip round the loop ----
await type("spent 42 euros at Lidl yesterday");
await pressReadThis();
report("1st parse shows the confirm step", confirmStepIsOpen());
report("1st parse filled the chips", chip(0) === "42", chipValues());

await pressSave();
report("1st save cleared the confirm step", !confirmStepIsOpen());
report("1st save cleared the add box", addBox().value === "", `add box = "${addBox().value}"`);
report("1st save reported success", container.textContent!.includes("Saved"));

// ---- second trip, with no page refresh ----
await type("bought 55 euros of food at Prisma");
report("add box accepted new text", addBox().value === "bought 55 euros of food at Prisma",
  `add box = "${addBox().value}"`);

await pressReadThis();
report("2nd parse shows the confirm step", confirmStepIsOpen());

const values = chipValues();
report("2nd parse shows the NEW amount (55, not 42)", chip(0) === "55", values);
report("2nd parse shows the NEW merchant (Prisma, not Lidl)", values.includes("Prisma"), values);

// ---- re-reading a different sentence without saving the first ----
await type("paid 9 euros for lunch at Fafa today");
await pressReadThis();
const reread = chipValues();
report("re-parse without saving shows the NEW amount (9)", chip(0) === "9", reread);
report("re-parse without saving shows the NEW merchant (Fafa)", reread.includes("| Fafa |"), reread);
report("re-parse without saving dropped the old merchant", !reread.includes("Prisma"), reread);

await pressSave();
report("2nd save worked", createdIds.length === 2, `rows created = ${createdIds.length}`);

// Clean up after ourselves so the demo data is left as it was found.
for (const id of createdIds) await realFetch(`${BACKEND}/api/expenses/${id}`, { method: "DELETE" });
console.log(`(removed ${createdIds.length} test rows)`);

console.log(process.exitCode ? "\nREPRODUCED A PROBLEM" : "\nfull cycle works");
