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
import type { CategorySlice, Expense, Summary } from "./api";
import App from "./App";
import { CategoryPie, foldToSixSlices } from "./components/CategoryPie";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";

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
    confidence={0.4} provider="mock" saving={false} onSave={() => {}} onCancel={() => {}}
  />,
);
check("missing amount is explained", noAmount.includes("No amount was found"));
check("save disabled without an amount", noAmount.includes("disabled"));

// 4. Summary cards.
const summary: Summary = {
  from: "2026-08-01", to: "2026-08-31", daysElapsed: 31,
  totalEur: "1836.95", count: 31, dailyAverageEur: "59.26",
  previous: { from: "2026-07-01", to: "2026-07-31", totalEur: "1975.22", count: 36 },
  changePercent: -7,
};
const cards = renderToStaticMarkup(<SummaryCards summary={summary} />);
check("card: month total", cards.includes("1,836.95"), cards.slice(0, 0));
check("card: names the month", cards.includes("August"));
check("card: count", cards.includes(">31<"));
check("card: daily average", cards.includes("59.26"));
check("card: change is signed", cards.includes("-7%"));
check("card: comparison says what it compares", cards.includes("same 31 days last month"));
check("card: down arrow for a fall", cards.includes("↓"));

const noComparison = renderToStaticMarkup(
  <SummaryCards summary={{ ...summary, changePercent: null }} />,
);
check(
  "card: nothing to compare is said, not shown as zero",
  noComparison.includes("Nothing recorded for the same days last month") &&
    !noComparison.includes("0%"),
);

// 5. The pie folds to six slices and always writes the values out.
const nine: CategorySlice[] = [
  { category: "Groceries", totalEur: "500.00", count: 10 },
  { category: "Bills", totalEur: "400.00", count: 8 },
  { category: "Shopping", totalEur: "300.00", count: 6 },
  { category: "Travel", totalEur: "200.00", count: 2 },
  { category: "Transport", totalEur: "100.00", count: 5 },
  { category: "Restaurants", totalEur: "50.00", count: 4 },
  { category: "Entertainment", totalEur: "40.00", count: 3 },
  { category: "Health", totalEur: "30.00", count: 2 },
  { category: "Other", totalEur: "20.00", count: 1 },
];
const folded = foldToSixSlices(nine);
check("pie: folds nine categories to six", folded.length === 6, `${folded.length} slices`);
check("pie: the sixth slice is Other", folded[5]?.category === "Other");
check(
  "pie: folding loses nothing",
  Math.round(folded.reduce((t, s) => t + Number(s.totalEur), 0) * 100) === 164000,
  String(folded.reduce((t, s) => t + Number(s.totalEur), 0)),
);
check(
  "pie: folded counts add up",
  folded.reduce((t, s) => t + s.count, 0) === 41,
);
check("pie: six or fewer is left alone", foldToSixSlices(nine.slice(0, 5)).length === 5);

// A real "Other" already in the top five must absorb the remainder rather than
// producing a second slice with the same name.
const withOtherHigh: CategorySlice[] = [
  { category: "Other", totalEur: "900.00", count: 9 },
  ...nine.slice(0, 8),
];
const merged = foldToSixSlices(withOtherHigh);
check(
  "pie: only ever one slice called Other",
  merged.filter((s) => s.category === "Other").length === 1,
);

const pie = renderToStaticMarkup(<CategoryPie categories={nine} from="2026-08-01" />);
check("pie: legend names each category", pie.includes("Groceries") && pie.includes("Bills"));
check("pie: legend carries the amount as text", pie.includes("500.00"));
check("pie: legend carries the share", pie.includes("%"));
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

const emptyPie = renderToStaticMarkup(<CategoryPie categories={[]} from="2026-08-01" />);
check("pie: empty month says so", emptyPie.includes("Nothing recorded this month yet"));

// 6. The trend chart.
const points = Array.from({ length: 14 }, (_, i) => ({
  weekStart: `2026-0${i < 5 ? 6 : i < 10 ? 7 : 8}-0${(i % 4) + 1}`,
  totalEur: (100 + i * 10).toFixed(2),
  count: i,
}));
const trend = renderToStaticMarkup(<TrendChart points={points} />);
check("trend: heading", trend.includes("The last three months"));
check("trend: says what a point is", trend.includes("Spending per week"));
check("trend: direct-labels the busiest week only", (trend.match(/busiest was/g) ?? []).length === 1);

// 7. The recent list.
const expenses: Expense[] = [
  {
    id: "1", amount: "30.00", currency: "GBP", amountEur: "35.10",
    merchant: "Tesco", category: "Groceries", description: null,
    expenseDate: "2026-08-29", createdAt: "2026-08-31T00:00:00.000Z", source: "web",
  },
  {
    id: "2", amount: "12.50", currency: "EUR", amountEur: "12.50",
    merchant: "Fafa", category: "Restaurants", description: null,
    expenseDate: "2026-08-31", createdAt: "2026-08-31T00:00:00.000Z", source: "mcp",
  },
];
const list = renderToStaticMarkup(<RecentExpenses expenses={expenses} total={97} />);
check("list: foreign currency shown", list.includes("30.00 GBP"));
check("list: euro amount shown", list.includes("35.10"));
check("list: euro row does not repeat itself", !list.includes("12.50 EUR"));
check("list: a row added elsewhere says so", list.includes("added by mcp"));
check("list: a row added here does not", !list.includes("added by web"));
check("list: says how many of how many", list.includes("showing 2 of 97"));

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nall checks passed");
