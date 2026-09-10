/**
 * The scaffolding the end-to-end checks share: a fake browser, a real backend.
 *
 * This was copied verbatim into two check scripts and was about to be copied
 * into a third, which is the point at which it becomes one file. `cycle-check`
 * still carries its own copy: it wraps `fetch` to record the ids of the rows it
 * creates so it can talk about them afterwards, and untangling that to share
 * this would have been a change to a check that is currently passing, for no
 * gain to the checks being written today.
 *
 * The backend is the real one, deliberately. A stubbed backend only ever proves
 * that the stub agrees with the frontend, which is exactly the assumption a
 * response-shape bug breaks.
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
// jsdom provides a real localStorage for the page's origin, which is what makes
// the folded-panel state checkable here at all.
g.localStorage = dom.window.localStorage;
g.IS_REACT_ACT_ENVIRONMENT = true;

const react = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("./App");

export const act = react.act;
export const window = dom.window;
export const container = dom.window.document.getElementById("root")!;

const BACKEND = "http://localhost:3000";
const realFetch = globalThis.fetch;

/** Every path the page asked for, so a check can assert what it did not ask for. */
export const requested: string[] = [];

g.fetch = async (url: string, init?: RequestInit) => {
  requested.push(url);
  return realFetch(BACKEND + url, init);
};

/**
 * Wait until nothing on the page still says it is loading.
 *
 * It has to match both wordings. The first-load message is "Loading your
 * expenses..." and a card's is "Loading...", and a check that waited only for
 * the second returned while the dashboard had not been drawn at all.
 */
export async function settle(): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    if (!(container.textContent ?? "").includes("Loading")) return;
  }
  throw new Error("the page never finished loading");
}

let root: ReturnType<typeof createRoot> | null = null;

/** Put the page on screen and wait for it to finish loading. */
export async function mount(): Promise<void> {
  const StrictMode = react.StrictMode;
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
  await settle();
}

/**
 * Take the page off screen entirely.
 *
 * Mounting again afterwards is as close to a reload as this harness gets: every
 * piece of React state is discarded, so anything that survives came back from
 * somewhere outside the component tree.
 */
export async function unmount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  root = null;
}

export async function press(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
  await settle();
}

export function report(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}
