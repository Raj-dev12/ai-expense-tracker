/**
 * WHAT THESE CHECKS CAN AND CANNOT SEE
 *
 * Every check here reads the HTML string a component produces. That catches a
 * crash, a missing value, a wrong label — anything about *content*.
 *
 * It cannot catch anything about *appearance*. Nothing here performs CSS layout,
 * so a value can be present in the markup and invisible on screen. That is not a
 * gap to be closed by adding assertions: rendering to a string has no widths, no
 * boxes, and no overflow, so the question cannot be asked here at all.
 *
 * This was not theoretical. The pie legend rendered every category name into the
 * markup while the browser showed "B" for "Bills" — the names were squeezed to
 * zero width and clipped. All 41 checks passed throughout, correctly: the text
 * was there. Only a real browser could have seen the problem.
 *
 * The two structural guards at the end of the pie section are the compromise:
 * they cannot see the layout either, but they assert the two specific decisions
 * that caused that bug. Treat them as a tripwire, not as proof.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createCategory, deleteCategory, deleteExpense, listExpenses } from "./api";
import type { CategoryName, CategorySlice, Expense, Summary } from "./api";
import App from "./App";
import {
  canStepForward,
  selectionLabel,
  selectionPhrase,
  step,
  trendWindowFor,
  windowFor,
  windowForSelection,
  type Period,
  type Selection,
} from "./periods";
import { PeriodPicker } from "./components/PeriodPicker";
import { BaseCurrencyPicker } from "./components/BaseCurrencyPicker";
import { CurrencyChoice } from "./components/CurrencyChoice";
import { CategoryManager } from "./components/CategoryManager";
import { CategoryPie, foldToSixSlices, isGroup } from "./components/CategoryPie";
import { DayView } from "./components/DayView";
import { buildPatch } from "./components/ExpenseEditor";
import { AnalysisCard } from "./components/AnalysisCard";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";

const TEST_CATEGORIES = ["Groceries", "Restaurants", "Uncategorised"];

function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

// 1. The page renders at all. This catches a missing import, a bad component
// reference, or a crash on first paint — the things that show a blank screen.
const app = renderToStaticMarkup(<App />);
check("page renders", app.length > 0);
check("heading present", app.includes("Expense tracker"));
check("add box present", app.includes("Spent 42 euros at Lidl yesterday"));
check("promise stated up front", app.includes("Nothing is saved until you confirm it"));

// 2. The confirm step renders with every field editable.
const review = renderToStaticMarkup(
  <SuggestionReview
    suggestion={{
      amount: 42,
      currency: "EUR",
      merchant: "Lidl",
      category: "Groceries",
      description: "spent 42 euros at Lidl yesterday",
      expenseDate: "2026-08-30",
    }}
    confidence={0.95}
    provider="mock"
    saving={false}
    showCurrency={true}
    categories={TEST_CATEGORIES}
    onSave={() => {}}
    onCancel={() => {}}
  />,
);

for (const label of ["Amount", "Currency", "Merchant", "Category", "Date", "Note"]) {
  check(`chip: ${label}`, review.includes(`>${label}</span>`));
}
check("save button", review.includes("Save expense"));
check("confidence shown quietly", review.includes("95% confident"));

// 3. A suggestion with no amount must block saving rather than invent one.
const noAmount = renderToStaticMarkup(
  <SuggestionReview
    suggestion={{
      amount: null, currency: "EUR", merchant: null, category: "Other",
      description: "coffee", expenseDate: "2026-08-31",
    }}
    confidence={0.4} provider="mock" saving={false} showCurrency={true}
    categories={TEST_CATEGORIES}
    onSave={() => {}} onCancel={() => {}}
  />,
);
check("missing amount is explained", noAmount.includes("No amount was found"));
check("save disabled without an amount", noAmount.includes("disabled"));

// 4. Summary cards.
const summary: Summary = {
  from: "2026-08-01", to: "2026-08-31", daysElapsed: 31,
  totalBase: "1836.95", count: 31, dailyAverageBase: "59.26",
  previous: { from: "2026-07-01", to: "2026-07-31", totalBase: "1975.22", count: 36 },
  changePercent: -7,
  baseline: "usable",
};
const cards = renderToStaticMarkup(<SummaryCards summary={summary} currency="EUR" phrase="this month" />);
check("card: month total", cards.includes("1,836.95"), cards.slice(0, 0));
check("card: names the period", cards.includes("Spent this month"));
check("card: count", cards.includes(">31<"));
check("card: daily average", cards.includes("59.26"));
check("card: change is signed", cards.includes("-7%"));
// The note names the window it actually compared against, taken from the
// response rather than described in prose, so a reader can check it against a
// calendar.
check("card: comparison names the window it compared against", cards.includes("1 Jul – 31 Jul"));
check("card: down arrow for a fall", cards.includes("↓"));

// The bug this card carried from the day the period dropdown arrived: every
// label said "month", and six of the seven periods are not one. A quarter was
// reported as "31 days last month" while the figure underneath compared it
// against 30 April to 30 June.
const quarterCards = renderToStaticMarkup(
  <SummaryCards
    summary={{
      from: "2026-07-01", to: "2026-08-31", daysElapsed: 62,
      totalBase: "3837.02", count: 64, dailyAverageBase: "61.89",
      previous: { from: "2026-04-30", to: "2026-06-30", totalBase: "1422.26", count: 31 },
      changePercent: 169.8,
      baseline: "usable",
    }}
    currency="EUR"
    phrase="this quarter"
  />,
);
check("card: a quarter is not called a month anywhere", !/month/i.test(quarterCards), quarterCards.match(/[^<>]*month[^<>]*/i)?.[0] ?? "");
check("card: a quarter names itself", quarterCards.includes("Spent this quarter"));
check("card: a quarter compares against the right window", quarterCards.includes("30 Apr – 30 Jun"));

const dayCards = renderToStaticMarkup(
  <SummaryCards
    summary={{
      from: "2026-08-31", to: "2026-08-31", daysElapsed: 1,
      totalBase: "56.00", count: 1, dailyAverageBase: "56.00",
      previous: { from: "2026-08-30", to: "2026-08-30", totalBase: "200.00", count: 4 },
      changePercent: -72,
      baseline: "usable",
    }}
    currency="EUR"
    phrase="today"
  />,
);
check("card: one day is singular", dayCards.includes("1 day so far") && !dayCards.includes("1 days"));
check("card: today reads as today", dayCards.includes("Spent today"));

const noComparison = renderToStaticMarkup(
  <SummaryCards
    summary={{ ...summary, changePercent: null, baseline: "empty" }}
    currency="EUR"
    phrase="this month"
  />,
);
check(
  "card: nothing to compare is said, not shown as zero",
  noComparison.includes("Nothing recorded in") && !noComparison.includes("0%"),
);

/*
  A baseline too small to compare against is a third outcome, not the same as an
  empty one. On the 1st of a month this period is one day and the stretch before
  it is one day, and a quiet day before a normal one produced "2586% more" —
  correct arithmetic describing nothing but whether a single purchase happened to
  land inside the window. The card must say which silence it is; a bare dash says
  neither, and a percentage says something false.
*/
const thinBaseline = renderToStaticMarkup(
  <SummaryCards
    summary={{ ...summary, changePercent: null, baseline: "too-small" }}
    currency="EUR"
    phrase="this month"
  />,
);
check("card: too little to compare is distinguished from nothing at all", thinBaseline.includes("Too little in"));
check("card: a thin baseline never shows a percentage", !/\d+%/.test(thinBaseline));
check(
  "card: the two silences do not read the same",
  !thinBaseline.includes("Nothing recorded in") && !noComparison.includes("Too little in"),
);

// 5. The pie folds to six slices and always writes the values out.
const nine: CategorySlice[] = [
  { category: "Groceries", totalBase: "500.00", count: 10 },
  { category: "Bills", totalBase: "400.00", count: 8 },
  { category: "Shopping", totalBase: "300.00", count: 6 },
  { category: "Travel", totalBase: "200.00", count: 2 },
  { category: "Transport", totalBase: "100.00", count: 5 },
  { category: "Restaurants", totalBase: "50.00", count: 4 },
  { category: "Entertainment", totalBase: "40.00", count: 3 },
  { category: "Health", totalBase: "30.00", count: 2 },
  { category: "Other", totalBase: "20.00", count: 1 },
];
const folded = foldToSixSlices(nine);
check("pie: folds nine categories to six", folded.length === 6, `${folded.length} slices`);
check("pie: the sixth slice is Other", folded[5]?.category === "Other");
check(
  "pie: folding loses nothing",
  Math.round(folded.reduce((t, s) => t + Number(s.totalBase), 0) * 100) === 164000,
  String(folded.reduce((t, s) => t + Number(s.totalBase), 0)),
);
check(
  "pie: folded counts add up",
  folded.reduce((t, s) => t + s.count, 0) === 41,
);
check("pie: six or fewer is left alone", foldToSixSlices(nine.slice(0, 5)).length === 5);

/*
  The seam: the tooltip and the click-through must describe the same expenses.

  This is the check that would have caught the reported bug, and the one no
  existing test crossed. The fold's arithmetic was already pinned — totals
  preserved, counts preserved, only ever one slice called "Other" — and every
  one of those passed while the chart and the panel below it disagreed. Each
  half was correct on its own; the bug lived between them.

  So this asserts the join rather than either side: whatever a slice claims,
  the categories it names must add up to exactly that.
*/
const foldedSlice = folded.find(isGroup);
check("pie: a fold produces a slice that is a group", foldedSlice !== undefined);

if (foldedSlice) {
  const byName = new Map(nine.map((c) => [c.category, c]));
  const fromMembers = foldedSlice.members.reduce(
    (sum, name) => sum + Number(byName.get(name)?.totalBase ?? NaN),
    0,
  );
  const memberCount = foldedSlice.members.reduce(
    (sum, name) => sum + (byName.get(name)?.count ?? NaN),
    0,
  );

  check(
    "pie: the group's total is exactly its members' total",
    Math.round(fromMembers * 100) === Math.round(Number(foldedSlice.totalBase) * 100),
    `slice ${foldedSlice.totalBase} vs members ${fromMembers.toFixed(2)}`,
  );
  check(
    "pie: the group's expense count is exactly its members' count",
    memberCount === foldedSlice.count,
    `slice ${foldedSlice.count} vs members ${memberCount}`,
  );
  // The specific shape of the old bug: members was effectively ["Other"], so
  // the panel fetched one category while the tooltip summed five.
  check(
    "pie: the group names more than the one category it is called after",
    foldedSlice.members.length > 1 && foldedSlice.members.includes("Other"),
    foldedSlice.members.join(", "),
  );
  check(
    "pie: a category folded away is still named somewhere",
    foldedSlice.members.includes("Restaurants"),
  );
}

/*
  And the request the panel actually sends. The invariant above is worth nothing
  if the fetch drops the set on the way out — which is precisely how the first
  version failed, by sending one name where the slice meant five.
*/
{
  const sent: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    sent.push(String(input));
    return new Response(JSON.stringify({ expenses: [], total: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await listExpenses({ from: "2026-08-01", to: "2026-08-31", categories: foldedSlice?.members ?? [] });
  globalThis.fetch = originalFetch;

  const url = sent[0] ?? "";
  const asked = [...new URLSearchParams(url.split("?")[1] ?? "").getAll("category")];
  check(
    "pie: the panel asks for every category in the group",
    foldedSlice !== undefined && asked.length === foldedSlice.members.length,
    `asked for ${asked.length}: ${asked.join(", ")}`,
  );
  check(
    "pie: the panel asks for them by repeated key, not a joined string",
    asked.every((name) => !name.includes(",")),
    url,
  );
}

// A real "Other" already in the top five must absorb the remainder rather than
// producing a second slice with the same name.
const withOtherHigh: CategorySlice[] = [
  { category: "Other", totalBase: "900.00", count: 9 },
  ...nine.slice(0, 8),
];
const merged = foldToSixSlices(withOtherHigh);
check(
  "pie: only ever one slice called Other",
  merged.filter((s) => s.category === "Other").length === 1,
);

const pie = renderToStaticMarkup(<CategoryPie categories={nine} from="2026-08-01" currency="EUR" selected={null} selectedExpenses={[]} selectedLoading={false} onSelect={() => {}} onDismiss={() => {}} />);
check("pie: legend names each category", pie.includes("Groceries") && pie.includes("Bills"));
check("pie: legend carries the amount as text", pie.includes("500.00"));
check("pie: legend carries the share", pie.includes("%"));

/*
  A folded slice must look like a group and name what is in it. Without this a
  real category disappears from the chart completely — Restaurants was drawn
  nowhere while the query box still answered questions about it by name, and
  nothing on screen said where it had gone.
*/
check("pie: a folded slice is labelled as a group, not as a category", pie.includes("categories"), "expected a member count in the label");
check("pie: the legend names the categories folded into the group", pie.includes("Restaurants") && pie.includes("Entertainment"));
// Structural guards for the bug that made the legend unreadable. Neither can
// see the screen; both assert the decision that keeps the text on it.
check(
  "pie: nothing in the legend truncates",
  !pie.includes("truncate"),
  "a clipped name is how \"Bills\" became \"B\"",
);
check(
  "pie: layout responds to the card, not the window",
  pie.includes("@container") && !pie.includes("sm:flex-row"),
  "a viewport breakpoint cannot know how wide this card is",
);

const emptyPie = renderToStaticMarkup(<CategoryPie categories={[]} from="2026-08-01" currency="EUR" selected={null} selectedExpenses={[]} selectedLoading={false} onSelect={() => {}} onDismiss={() => {}} />);
check("pie: empty month says so", emptyPie.includes("Nothing recorded this month yet"));

// 6. The trend chart.
const points = Array.from({ length: 14 }, (_, i) => ({
  weekStart: `2026-0${i < 5 ? 6 : i < 10 ? 7 : 8}-0${(i % 4) + 1}`,
  totalBase: (100 + i * 10).toFixed(2),
  count: i,
}));
const trend = renderToStaticMarkup(<TrendChart points={points} currency="EUR" />);
check("trend: heading", trend.includes("The last three months"));
check("trend: says what a point is", trend.includes("Spending per week"));
check("trend: direct-labels the busiest week only", (trend.match(/busiest was/g) ?? []).length === 1);

// 7. The recent list.
const expenses: Expense[] = [
  {
    id: "1", amount: "30.00", currency: "GBP", amountBase: "35.10",
    merchant: "Tesco", category: "Groceries", description: null,
    expenseDate: "2026-08-29", createdAt: "2026-08-31T00:00:00.000Z", source: "web",
  },
  {
    id: "2", amount: "12.50", currency: "EUR", amountBase: "12.50",
    merchant: "Fafa", category: "Restaurants", description: null,
    expenseDate: "2026-08-31", createdAt: "2026-08-31T00:00:00.000Z", source: "mcp",
  },
];
const listProps = {
  currency: "EUR",
  showCurrency: true,
  categories: TEST_CATEGORIES,
  onDelete: () => {},
  editingId: null,
  savingEdit: false,
  editError: null,
  onEdit: () => {},
  onCancelEdit: () => {},
  onSaveEdit: () => {},
};
const list = renderToStaticMarkup(
  <RecentExpenses expenses={expenses} total={97} {...listProps} />,
);
check("list: foreign currency shown", list.includes("30.00 GBP"));
check("list: euro amount shown", list.includes("35.10"));
check("list: euro row does not repeat itself", !list.includes("12.50 EUR"));
check("list: a row added elsewhere says so", list.includes("added by mcp"));
check("list: a row added here does not", !list.includes("added by web"));
check("list: says how many of how many", list.includes("showing 2 of 97"));

// 8. The monthly summary.
//
// The checks that matter here are about honesty rather than layout: the card
// must name the parser that actually wrote the sentence, and it must not claim
// a real provider wrote something the mock produced.
const idle = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={null}
    writtenAt={null}
    loading={false}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
// The heading is a period dropdown now, not a fixed month.
check("summary: the period is chosen, not fixed", idle.includes("This month") && idle.includes("in words"));
check("summary: every period is offered", ["Today", "This week", "This month", "This quarter", "This half year", "Last three quarters", "This year"].every((label) => idle.includes(label)));
check("summary: button invites a first run", idle.includes("Summarise this month"));
// apostrophes are HTML-escaped in the markup, so the assertion stops short of one
check("summary: says what the button will do", idle.includes("describe this spending"));

const written = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={{
      provider: "mock",
      saved: false,
      month: "2026-08-01",
      from: "2026-08-01",
      to: "2026-08-31",
      summary: "In August 2026 you spent €1854.45 across 31 expenses.",
    }}
    writtenAt={new Date("2026-08-31T22:41:00Z")}
    loading={false}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
check("summary: the sentence is shown", written.includes("across 31 expenses"));
check("summary: credits the mock", written.includes("Written by the mock parser"));
check("summary: explains what the mock is", written.includes("no API key needed"));
check("summary: offers to rewrite once written", written.includes("Write it again"));

// The important one. A summary the mock produced must never be credited to a
// provider that was merely configured — on a fallback those differ, and this is
// the field that tells the truth about it.
const byClaude = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={{ provider: "claude", saved: false, month: "2026-08-01", from: "2026-08-01", to: "2026-08-31", summary: "A sentence." }}
    writtenAt={new Date("2026-08-31T22:41:00Z")}
    loading={false}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
check("summary: credits the real provider when it answered", byClaude.includes("Written by the claude parser"));
check("summary: does not also claim the mock", !byClaude.includes("mock"));

const failed = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={null}
    writtenAt={null}
    loading={false}
    error="Could not write a summary"
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
check("summary: an error is shown in the card", failed.includes("Could not write a summary"));

const writing = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={null}
    writtenAt={null}
    loading={true}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
check("summary: button says it is working", writing.includes("Writing..."));
check("summary: button disabled while working", writing.includes("disabled"));

// 9. Editing a row in place.
const editable = expenses[0]!;

check("list: every row offers an edit", (list.match(/>Edit</g) ?? []).length === expenses.length);

const editing = renderToStaticMarkup(
  <RecentExpenses
    expenses={expenses}
    total={97}
    {...listProps}
    editingId={editable.id}
  />,
);
check("edit: the open row shows the chips", editing.includes(">Amount</span>"));
check("edit: same six chips as the add box", ["Amount", "Currency", "Merchant", "Category", "Date", "Note"].every((l) => editing.includes(`>${l}</span>`)));
check("edit: the row it replaces is gone", !editing.includes("35.10"));
check("edit: other rows are untouched", editing.includes("12.50"));
check("edit: save button", editing.includes("Save changes"));

// The PATCH rule, asserted directly: an untouched form must send nothing, and a
// changed field must send only itself. This is what keeps renaming a shop from
// re-converting the currency.
const unchanged = buildPatch(editable, {
  amount: editable.amount,
  currency: editable.currency,
  merchant: editable.merchant ?? "",
  category: editable.category as CategoryName,
  expenseDate: editable.expenseDate,
  note: editable.description ?? "",
});
check("patch: an untouched form changes nothing", Object.keys(unchanged).length === 0, JSON.stringify(unchanged));

const renamed = buildPatch(editable, {
  amount: editable.amount,
  currency: editable.currency,
  merchant: "Lidl",
  category: editable.category as CategoryName,
  expenseDate: editable.expenseDate,
  note: editable.description ?? "",
});
check("patch: renaming sends only the merchant", JSON.stringify(renamed) === '{"merchant":"Lidl"}', JSON.stringify(renamed));

const cleared = buildPatch(editable, {
  amount: editable.amount,
  currency: editable.currency,
  merchant: "",
  category: editable.category as CategoryName,
  expenseDate: editable.expenseDate,
  note: editable.description ?? "",
});
check("patch: clearing a field sends null, not an empty string", cleared.merchant === null, JSON.stringify(cleared));

const repriced = buildPatch(editable, {
  amount: "41.00",
  currency: editable.currency,
  merchant: editable.merchant ?? "",
  category: editable.category as CategoryName,
  expenseDate: editable.expenseDate,
  note: editable.description ?? "",
});
check("patch: a new amount is sent as a number", repriced.amount === 41, JSON.stringify(repriced));

const commaTyped = buildPatch(editable, {
  amount: "41,50",
  currency: editable.currency,
  merchant: editable.merchant ?? "",
  category: editable.category as CategoryName,
  expenseDate: editable.expenseDate,
  note: editable.description ?? "",
});
check("patch: a comma decimal is understood", commaTyped.amount === 41.5, JSON.stringify(commaTyped));

// 10. The base currency reaches every number on the page.
//
// The point of the rename is that nothing says "euro" unless the euro is
// actually the base, so these render the same fixtures as pounds and check the
// symbol followed the setting.
const cardsGbp = renderToStaticMarkup(<SummaryCards summary={summary} currency="GBP" phrase="this month" />);
check("currency: cards use the base symbol", cardsGbp.includes("£1,836.95"), cardsGbp.match(/[£€][0-9,.]+/)?.[0] ?? "none");
check("currency: cards do not still say euro", !cardsGbp.includes("€"));

const pieGbp = renderToStaticMarkup(<CategoryPie categories={nine} from="2026-08-01" currency="GBP" selected={null} selectedExpenses={[]} selectedLoading={false} onSelect={() => {}} onDismiss={() => {}} />);
check("currency: the pie legend follows the base", pieGbp.includes("£500.00"));
check("currency: the pie legend drops the euro", !pieGbp.includes("€"));

const listGbp = renderToStaticMarkup(
  <RecentExpenses expenses={expenses} total={97} {...listProps} currency="GBP" />,
);
check("currency: the list follows the base", listGbp.includes("£35.10"));
// The €12.50 row was entered in EUR. With a GBP base that is now a foreign
// currency, so the original has to appear — it did not before, when EUR was the
// base and showing it would have been repeating the same number twice.
check("currency: a row in the old base now shows its original", listGbp.includes("12.50 EUR"));
check("currency: the row in the base currency still does not repeat itself", !listGbp.includes("30.00 GBP"));

// 11. The base currency picker, and the first-visit choice.
const picker = renderToStaticMarkup(
  <BaseCurrencyPicker value="EUR" currencies={["EUR", "GBP", "SEK"]} saving={false} onChange={() => {}} />,
);
check("picker: labelled", picker.includes("Totals in"));
check("picker: offers the list it was given", (picker.match(/<option/g) ?? []).length === 3);
// The behaviour changed: switching used to recompute foreign rows and relabel
// the rest, which made a round trip lossy. It now only changes the symbol, and
// the note has to say so rather than describing the old two-way split.
check("picker: promises the symbol only", picker.includes("Changes the symbol only"));
check("picker: no longer claims to convert anything", !picker.includes("converted again"));

const choice = renderToStaticMarkup(
  <CurrencyChoice currencies={["EUR", "GBP", "SEK", "JPY"]} saving={false} error={null} onChoose={() => {}} />,
);
check("first visit: asks before anything else", choice.includes("Which currency do you use"));
check("first visit: explains the demo numbers are plain", choice.includes("plain numbers"));
check("first visit: says it can be changed later", choice.includes("change it later"));
check("first visit: offers every currency it was given", (choice.match(/<option/g) ?? []).length === 4);
check("first visit: names the one that will be used", choice.includes("Use EUR"));
// No skip. Every screen behind this one needs an answer, so offering a way past
// it would only produce amounts with no symbol.
check("first visit: cannot be skipped", !/skip|later|dismiss/i.test(choice.replace(/change it later/gi, "")));

// 12. Categories are data, and can be added and removed.
const withCats = renderToStaticMarkup(
  <RecentExpenses expenses={expenses} total={97} {...listProps} editingId={expenses[0]!.id} />,
);
check("category box offers the live list, not a compiled-in one", TEST_CATEGORIES.every((name) => withCats.includes(`>${name}</option>`)));
// The dropdown chooses and nothing else now. Making a category moved to the
// Categories panel, so a control that sometimes turns into a text box is gone.
check("category box no longer doubles as a create form", !withCats.includes("+ Type a new category"));
// The saved category may have been deleted while the form was open. Dropping it
// silently would change somebody's expense underneath them.
const orphaned = renderToStaticMarkup(
  <RecentExpenses
    expenses={[{ ...expenses[0]!, category: "Deleted thing" }]}
    total={1}
    {...listProps}
    editingId={expenses[0]!.id}
  />,
);
check("a category that no longer exists is still shown, not swapped", orphaned.includes(">Deleted thing</option>"));

// 13. Deleting an expense asks first, and says what goes.
check("every row offers a delete", (list.match(/>Delete</g) ?? []).length === expenses.length);
check("deleting is not one click", !list.includes("This cannot be undone"));

// 14. The category manager.
const manager = renderToStaticMarkup(
  <CategoryManager
    categories={[
      { name: "Groceries", expenseCount: 28 },
      { name: "Travel", expenseCount: 0 },
      { name: "Uncategorised", expenseCount: 3 },
    ]}
    uncategorised="Uncategorised"
    busy={false}
    error={null}
    onAdd={() => {}}
    onRename={() => {}}
    onDelete={() => {}}
  />,
);
check("manager: lists the categories", manager.includes("Groceries") && manager.includes("Travel"));
check("manager: shows how full each one is", manager.includes("28 expenses") && manager.includes("0 expenses"));
check("manager: singular for one", manager.includes("3 expenses"));
// Uncategorised is where a delete sends things, so it cannot itself go.
check("manager: Uncategorised has no delete", (manager.match(/>Delete</g) ?? []).length === 2);
check("manager: says why it is kept", manager.includes(">kept</span>"));

// Adding lives here now, not in the dropdown.
check("manager: has an add box", manager.includes("Add a category"));
// Renaming is offered on every category except the one that cannot be renamed.
check("manager: offers rename", (manager.match(/>Rename</g) ?? []).length === 2);

// 16. Renaming warns about the expenses it will rewrite.
//
// An expense stores its category as text, so a rename is not just a label
// change — it rewrites rows. Saying so before it happens is the whole point.
const renamingFull = renderToStaticMarkup(
  <CategoryManager
    categories={[{ name: "Groceries", expenseCount: 28 }]}
    uncategorised="Uncategorised"
    busy={false}
    error={null}
    onAdd={() => {}}
    onRename={() => {}}
    onDelete={() => {}}
  />,
);
check("manager: a category with expenses shows its count", renamingFull.includes("28 expenses"));

// 17. The list shows everything, in a box that does not grow the page.
const wholeList = renderToStaticMarkup(
  <RecentExpenses expenses={expenses} total={expenses.length} {...listProps} />,
);
check("list: says the count plainly when it holds everything", wholeList.includes("2 expenses"));
check("list: scrolls inside a fixed height", wholeList.includes("max-h-") && wholeList.includes("overflow-y-auto"));
const partial = renderToStaticMarkup(
  <RecentExpenses expenses={expenses} total={500} {...listProps} />,
);
check("list: still says showing N of M when it does not", partial.includes("showing 2 of 500"));

// 18. The day view: one day, as a table.
const dayFull = renderToStaticMarkup(
  <DayView
    date="2026-08-31"
    expenses={expenses}
    currency="EUR"
    loading={false}
    onDateChange={() => {}}
  />,
);
// en-GB writes this without a comma: "Monday 31 August".
check("day: names the day in full", dayFull.includes("Monday 31 August"));
check("day: is a real table", dayFull.includes("<table") && dayFull.includes("<thead"));
check(
  "day: has the columns a day needs",
  ["What", "Category", "Amount"].every((heading) => dayFull.includes(`>${heading}</th>`)),
);
check("day: has a date picker set to the day shown", dayFull.includes('type="date"') && dayFull.includes('value="2026-08-31"'));
check("day: counts what it holds", dayFull.includes("2 expenses"));
// A column of amounts with no sum is a table asking to be added up by hand.
check("day: totals the day", dayFull.includes(">Total</td>") && dayFull.includes("47.60"));
check("day: marks a row that came from elsewhere", dayFull.includes("added by mcp"));

const dayEmpty = renderToStaticMarkup(
  <DayView date="2026-08-30" expenses={[]} currency="EUR" loading={false} onDateChange={() => {}} />,
);
check(
  "day: an empty day says so rather than showing an empty table",
  dayEmpty.includes("Nothing spent on this day") && !dayEmpty.includes("<table"),
);

const dayGbp = renderToStaticMarkup(
  <DayView date="2026-08-31" expenses={expenses} currency="GBP" loading={false} onDateChange={() => {}} />,
);
check("day: follows the base currency", dayGbp.includes("£") && !dayGbp.includes("€"));

// 19. A re-run of the summary is visible even when the words are identical.
//
// The reported bug was "it works once and then goes dead". It was not dead: the
// parser is deterministic, so a second press returned the same sentence and
// nothing on the card changed. These assert the two things that now differ.
const rerunning = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={{ provider: "mock", saved: false, month: "2026-08-01", from: "2026-08-01", to: "2026-08-31", summary: "A sentence." }}
    writtenAt={new Date("2026-08-31T20:41:00Z")}
    loading={true}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
check("summary: a re-run replaces the sentence while it works", rerunning.includes("Writing it again"));
check("summary: the old sentence is not left sitting there", !rerunning.includes("A sentence."));

const reWritten = renderToStaticMarkup(
  <AnalysisCard
    selection={{ kind: "period", period: "month", offset: 0 }}
    onSelectionChange={() => {}}
    summary={{ provider: "mock", saved: false, month: "2026-08-01", from: "2026-08-01", to: "2026-08-31", summary: "A sentence." }}
    writtenAt={new Date("2026-08-31T20:41:00Z")}
    loading={false}
    error={null}
    onRequest={() => {}}
    answer={null}
    asking={false}
    askError={null}
    onAsk={() => {}}
  />,
);
// The clock is the only thing that changes when the words do not.
check("summary: says when it was written", /\d\d?:\d\d/.test(reWritten), reWritten.match(/\d\d?:\d\d[:\d]*/)?.[0] ?? "no time found");

// 20. The pie opens a panel for a category.
const pieOpen = renderToStaticMarkup(
  <CategoryPie
    categories={nine}
    from="2026-08-01"
    currency="EUR"
    selected={{ category: "Groceries", totalBase: "500.00", count: 10, members: ["Groceries"] }}
    selectedExpenses={expenses}
    selectedLoading={false}
    onSelect={() => {}}
    onDismiss={() => {}}
  />,
);
check("pie: the panel names the category and the period", pieOpen.includes("Groceries") && pieOpen.includes("August"));
check("pie: the panel lists that category's expenses", pieOpen.includes("Tesco") && pieOpen.includes("Fafa"));
check("pie: the panel can be closed", pieOpen.includes(">Close</button>"));
// The legend rows are buttons because an SVG pie slice cannot be reached with a
// keyboard. Same action, same panel.
check("pie: the legend is keyboard reachable", pieOpen.includes('aria-expanded="true"'));

const pieEmptyPanel = renderToStaticMarkup(
  <CategoryPie
    categories={nine}
    from="2026-08-01"
    currency="EUR"
    selected={{ category: "Travel", totalBase: "200.00", count: 2, members: ["Travel"] }}
    selectedExpenses={[]}
    selectedLoading={false}
    onSelect={() => {}}
    onDismiss={() => {}}
  />,
);
check("pie: an empty category says so", pieEmptyPanel.includes("Nothing in this category"));
check("pie: nothing is open until something is picked", !pie.includes(">Close</button>"));

// 21. The calendar periods.
//
// Pure arithmetic and the part most likely to be quietly wrong, so it is checked
// against fixed dates rather than against whatever today happens to be. Every
// period ends today and starts at the beginning of its calendar block.
//
// 2026-08-31 is a Monday in Q3.
const w = (period: Parameters<typeof windowFor>[0]) => windowFor(period, "2026-08-31");
check("period: today is one day", w("day").from === "2026-08-31" && w("day").to === "2026-08-31");
check("period: the week starts on Monday", w("week").from === "2026-08-31", w("week").from);
check("period: the month starts on the first", w("month").from === "2026-08-01", w("month").from);
check("period: Q3 starts in July", w("quarter").from === "2026-07-01", w("quarter").from);
check("period: the second half starts in July", w("half").from === "2026-07-01", w("half").from);
check("period: three quarters back from Q3 is January", w("threeQuarters").from === "2026-01-01", w("threeQuarters").from);
check("period: the year starts in January", w("year").from === "2026-01-01", w("year").from);
check("period: every period ends today", ["day", "week", "month", "quarter", "half", "threeQuarters", "year"].every((p) => w(p as Parameters<typeof windowFor>[0]).to === "2026-08-31"));

// A Sunday must belong to the week that began the Monday before, not start a
// new one — the trap in every week calculation.
check("period: Sunday belongs to the week that began on Monday", windowFor("week", "2026-08-30").from === "2026-08-24", windowFor("week", "2026-08-30").from);
// Crossing a year boundary: in Q1, three quarters back lands in the previous year.
check("period: three quarters back from Q1 crosses the year", windowFor("threeQuarters", "2026-02-10").from === "2025-07-01", windowFor("threeQuarters", "2026-02-10").from);
check("period: the first half starts in January", windowFor("half", "2026-02-10").from === "2026-01-01");
check("period: Q2 starts in April", windowFor("quarter", "2026-05-05").from === "2026-04-01");

// 22. The question box.
const cardProps = {
  selection: { kind: "period" as const, period: "month" as const, offset: 0 },
  onSelectionChange: () => {},
  summary: null,
  writtenAt: null,
  loading: false,
  error: null,
  onRequest: () => {},
  asking: false,
  askError: null,
  onAsk: () => {},
};

const askIdle = renderToStaticMarkup(<AnalysisCard {...cardProps} answer={null} />);
check("ask: the box is there", askIdle.includes("Ask about your spending"));
// The placeholder has to read as a question, because the add box at the top of
// the page also takes a sentence and that is this feature's one real hazard.
check("ask: the placeholder asks rather than states", askIdle.includes("highest expense in Travel"));
// One accent-coloured control in the card. A second *primary* button beside the
// box would be two things competing for the same glance.
//
// This counts primary buttons rather than buttons. It used to count every
// <button> and expect one, which was true until the period arrows arrived —
// neutral, secondary controls that compete with nothing. Counting the accent
// colour asserts the thing the rule is actually about, and does not drift when
// another quiet control is added.
const primaryButtons = (askIdle.match(/class="[^"]*(?<![-\w])bg-accent(?![-\w])[^"]*"/g) ?? []).length;
check("ask: the box has no primary button of its own", primaryButtons === 1, String(primaryButtons));

const answered = renderToStaticMarkup(
  <AnalysisCard
    {...cardProps}
    answer={{
      provider: "mock",
      saved: false,
      answerable: true,
      looksLikeExpense: false,
      answer: "Your highest expense in Travel was €196.83 at Booking.com on 2 July 2026.",
      reading: "highest 1 expense · Travel · 1 to 31 August 2026",
    }}
  />,
);
check("ask: the answer is shown", answered.includes("Booking.com"));
// The same honesty as the confirm step: a misread question should look like a
// misread question rather than a surprising number.
check("ask: how the question was read is shown", answered.includes("read as:"));

const refused = renderToStaticMarkup(
  <AnalysisCard
    {...cardProps}
    answer={{
      provider: "mock",
      saved: false,
      answerable: false,
      looksLikeExpense: false,
      answer: "I can only look up what was spent — not why.",
      reading: null,
    }}
  />,
);
check("ask: a refusal is shown plainly", refused.includes("I can only look up what was spent"));
check("ask: a refusal carries no reading", !refused.includes("read as:"));

const signposted = renderToStaticMarkup(
  <AnalysisCard
    {...cardProps}
    answer={{
      provider: "mock",
      saved: false,
      answerable: false,
      looksLikeExpense: true,
      answer: "That looks like an expense rather than a question.",
      reading: null,
    }}
  />,
);
check("ask: an expense gets a signpost", signposted.includes("That looks like an expense"));
check("ask: the signpost points at the add box", signposted.includes("box at the top of the page"));

// 15. Requests only announce JSON when they are actually sending some.
//
// This is a regression guard, not a feature test. Fastify refuses a request that
// sets Content-Type: application/json and then sends no body, so a DELETE with
// that header is a 400 before it reaches any route. The same bug was fixed in
// the MCP server's client in hour 4 and came back here, because the browser and
// the MCP server build their requests separately. If the header is ever made
// unconditional again, these fail.
{
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    sent.push({ url, init });
    return {
      ok: true,
      status: 200,
      // Deliberately not a valid response for any of these. Every call below is
      // caught, because what is being asserted is the request that went out, not
      // the reply that came back.
      json: async () => ({}),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const headersOf = (init: RequestInit) => new Headers(init.headers as HeadersInit);

  await deleteExpense("11111111-1111-4111-8111-111111111111").catch(() => {});
  check(
    "DELETE an expense sends no Content-Type",
    !headersOf(sent.at(-1)!.init).has("content-type"),
    [...headersOf(sent.at(-1)!.init).keys()].join(", ") || "no headers",
  );

  await deleteCategory("Travel", "reassign").catch(() => {});
  const categoryCall = sent.at(-1)!;
  check(
    "DELETE a category sends no Content-Type",
    !headersOf(categoryCall.init).has("content-type"),
    [...headersOf(categoryCall.init).keys()].join(", ") || "no headers",
  );
  // The choice travels in the query string, which is why that request has no
  // body either — worth asserting, because moving it into a body would quietly
  // reintroduce the need for the header.
  check(
    "the category delete puts its choice in the query string",
    categoryCall.url.includes("expenses=reassign") && categoryCall.init.body === undefined,
    categoryCall.url,
  );

  await createCategory("Coffee").catch(() => {});
  check(
    "POST with a body still announces JSON",
    headersOf(sent.at(-1)!.init).get("content-type") === "application/json",
    headersOf(sent.at(-1)!.init).get("content-type") ?? "none",
  );

  globalThis.fetch = original;
}

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nall checks passed");

// 23. Stepping the period.
//
// Every option used to be anchored to today, so there was no way to look at
// July. The dropdown now chooses how long a block is and the arrows choose
// which block.
const TODAY = "2026-09-03";
const sel = (period: Period, offset: number): Selection => ({ kind: "period", period, offset });

check(
  "period: the current block runs to today, not to the end of the month",
  windowForSelection(sel("month", 0), TODAY).to === TODAY,
);
// A stepped block is complete. This is what makes the comparison honest: a whole
// August against a whole July, rather than "1 August to the 3rd" against a
// stretch of the same odd length.
check(
  "period: a stepped block is complete, not partial",
  windowForSelection(sel("month", -1), TODAY).from === "2026-08-01" &&
    windowForSelection(sel("month", -1), TODAY).to === "2026-08-31",
  JSON.stringify(windowForSelection(sel("month", -1), TODAY)),
);
// Stepping back from the 3rd of a month must not skip February or land on the
// 3rd of nowhere. The month arithmetic never touches a Date for this reason.
check(
  "period: stepping back over short months lands on real blocks",
  windowForSelection(sel("month", -6), TODAY).from === "2026-03-01" &&
    windowForSelection(sel("month", -6), TODAY).to === "2026-03-31",
  JSON.stringify(windowForSelection(sel("month", -6), TODAY)),
);
check(
  "period: quarters step by three months and end on the quarter",
  windowForSelection(sel("quarter", -1), TODAY).from === "2026-04-01" &&
    windowForSelection(sel("quarter", -1), TODAY).to === "2026-06-30",
);
check(
  "period: a year steps to the whole previous year",
  windowForSelection(sel("year", -1), TODAY).from === "2025-01-01" &&
    windowForSelection(sel("year", -1), TODAY).to === "2025-12-31",
);
// There is no spending in the future, so forward stops at the present rather
// than walking into empty months.
check("period: forward is blocked at the present", !canStepForward(sel("month", 0)));
check("period: forward is offered once stepped back", canStepForward(sel("month", -1)));
check(
  "period: stepping forward never passes the present",
  step(sel("month", 0), 1).kind === "period" &&
    (step(sel("month", 0), 1) as { offset: number }).offset === 0,
);

// Absolute names, never relative ones. "Last month" is readable exactly once and
// "three quarters ago" collides with the period actually called three quarters.
check("period: unstepped keeps the name it always had", selectionLabel(sel("month", 0), TODAY) === "This month");
check("period: a stepped month names itself", selectionLabel(sel("month", -1), TODAY) === "August 2026");
check("period: a stepped quarter names itself", selectionLabel(sel("quarter", -1), TODAY) === "Q2 2026");
check("period: a stepped year names itself", selectionLabel(sel("year", -1), TODAY) === "2025");
check(
  "period: no label says 'last' or 'ago'",
  !/\b(last|ago)\b/i.test(
    [sel("month", -1), sel("quarter", -2), sel("year", -1), sel("week", -1), sel("day", -1)]
      .map((s) => selectionLabel(s, TODAY))
      .join(" "),
  ),
);
// The grammar has to survive stepping too: "Spent this month" was fine and
// "Spent August 2026" is not a sentence.
check("period: the phrase keeps its preposition", selectionPhrase(sel("month", -1), TODAY) === "in August 2026");
check("period: a single day takes 'on'", selectionPhrase(sel("day", -1), TODAY) === "on 2 Sep 2026");
check("period: unstepped phrasing is unchanged", selectionPhrase(sel("month", 0), TODAY) === "this month");

const custom: Selection = { kind: "custom", from: "2026-06-01", to: "2026-07-15" };
check("period: a custom range is its own window", JSON.stringify(windowForSelection(custom, TODAY)) === JSON.stringify({ from: "2026-06-01", to: "2026-07-15" }));
check("period: a custom range writes the year once", selectionLabel(custom, TODAY) === "1 Jun – 15 Jul 2026");
check("period: a custom range cannot be stepped", !canStepForward(custom) && step(custom, -1) === custom);

// The trend stays fourteen weeks wide but ends where the period ends. Pinned to
// today it was the one chart on a July dashboard describing September.
const trendNow = trendWindowFor(sel("month", 0), TODAY);
const trendThen = trendWindowFor(sel("month", -1), TODAY);
check("period: the trend ends where the period ends", trendNow.to === TODAY && trendThen.to === "2026-08-31");
// Fourteen weeks wide always, but ending where the period ends. The exact start
// is the Monday of the week the period ends in, so two windows ending in the
// same week share it — 31 August and 3 September do, which is why this asserts
// the width rather than a pair of literal dates.
const spanDays = (w: { from: string; to: string }) =>
  Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000);
const trendJuly = trendWindowFor(sel("month", -2), TODAY);
check(
  "period: the trend stays fourteen weeks wide however far back it goes",
  [trendNow, trendThen, trendJuly].every((w) => spanDays(w) >= 91 && spanDays(w) <= 97),
  [trendNow, trendThen, trendJuly].map(spanDays).join(", ") + " days",
);
check(
  "period: stepping to a different week moves the trend with it",
  trendJuly.to === "2026-07-31" && trendJuly.from === "2026-04-27",
  `${trendJuly.from} .. ${trendJuly.to}`,
);

// The picker itself.
const periodPicker = renderToStaticMarkup(
  <PeriodPicker selection={sel("month", 0)} onChange={() => {}} today={TODAY} />,
);
check("periodPicker: the arrows are reachable by name", periodPicker.includes('aria-label="Previous period"') && periodPicker.includes('aria-label="Next period"'));
check("periodPicker: forward is disabled at the present", /aria-label="Next period"[^>]* disabled=""/.test(periodPicker));
check("periodPicker: a custom range is offered", periodPicker.includes(">Custom range</option>"));
// The exact dates are always written out: "This month" does not say where a
// partial block stops, and "August 2026" does not say it is complete.
check("periodPicker: the window's dates are shown", periodPicker.includes("1 Sep") && periodPicker.includes("3 Sep"));

const steppedPicker = renderToStaticMarkup(
  <PeriodPicker selection={sel("month", -1)} onChange={() => {}} today={TODAY} />,
);
// `disabled=""` precisely: the button's own Tailwind classes contain the word
// "disabled" (disabled:cursor-not-allowed), so a looser match reads every arrow
// as disabled and the check passes for the wrong reason.
check("periodPicker: forward is offered once stepped back", !/aria-label="Next period"[^>]* disabled=""/.test(steppedPicker));
check("periodPicker: a stepped window shows its real dates", steppedPicker.includes("1 Aug") && steppedPicker.includes("31 Aug"));

const customPicker = renderToStaticMarkup(
  <PeriodPicker selection={custom} onChange={() => {}} today={TODAY} />,
);
check("periodPicker: a custom range offers two date boxes", (customPicker.match(/type="date"/g) ?? []).length === 2);
// Typing a range end-first would otherwise describe a window running backwards,
// and the charts would empty for a reason nobody could see.
check("periodPicker: the range cannot be typed backwards", customPicker.includes('max="2026-07-15"') && customPicker.includes('min="2026-06-01"'));
check("periodPicker: a custom range hides the arrows", !customPicker.includes('aria-label="Previous period"'));

// The third silence on the change card. A custom range has a perfectly
// well-defined stretch before it, with real spending in it — it is simply a
// stretch nobody chose.
const customCards = renderToStaticMarkup(
  <SummaryCards
    summary={{ ...summary, changePercent: null, baseline: "not-comparable" }}
    currency="EUR"
    phrase="from 1 Jun to 15 Jul 2026"
  />,
);
check("card: a custom range says why there is no comparison", customCards.includes("No comparison for a custom range"));
check("card: a custom range shows no percentage", !/\d+%/.test(customCards));
check("card: the three silences all read differently", !customCards.includes("Nothing recorded in") && !customCards.includes("Too little in"));
check("card: a stepped window is named in the cards", customCards.includes("Spent from 1 Jun to 15 Jul 2026"));
