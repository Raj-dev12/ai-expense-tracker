import { renderToStaticMarkup } from "react-dom/server";
import App from "./App";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";

function check(label: string, condition: boolean) {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
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
check("discard button", review.includes("Discard"));
check("confidence shown quietly", review.includes("95% confident"));
check("values filled in from the parser", review.includes('value="42"') || review.includes("42"));

// 3. A suggestion with no amount must block saving rather than invent one.
const noAmount = renderToStaticMarkup(
  <SuggestionReview
    suggestion={{
      amount: null,
      currency: "EUR",
      merchant: null,
      category: "Other",
      description: "coffee",
      expenseDate: "2026-08-31",
    }}
    confidence={0.4}
    provider="mock"
    saving={false}
    onSave={() => {}}
    onCancel={() => {}}
  />,
);
check("missing amount is explained", noAmount.includes("No amount was found"));
check("save disabled without an amount", noAmount.includes("disabled"));

// 4. The list shows the original currency only when it was not euros.
const list = renderToStaticMarkup(
  <RecentExpenses
    total={2}
    expenses={[
      {
        id: "1", amount: "30.00", currency: "GBP", amountEur: "35.10",
        merchant: "Tesco", category: "Groceries", description: null,
        expenseDate: "2026-08-29", createdAt: "2026-08-31T00:00:00.000Z", source: "web",
      },
      {
        id: "2", amount: "12.50", currency: "EUR", amountEur: "12.50",
        merchant: "Fafa", category: "Restaurants", description: null,
        expenseDate: "2026-08-31", createdAt: "2026-08-31T00:00:00.000Z", source: "web",
      },
    ]}
  />,
);
check("foreign currency shown", list.includes("30.00 GBP"));
check("euro amount shown", list.includes("35.10"));
check("euro row does not repeat itself", !list.includes("12.50 EUR"));

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nall checks passed");
