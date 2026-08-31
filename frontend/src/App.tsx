import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createExpense,
  getCategories,
  getMonthlySummary,
  getSettings,
  getSummary,
  getTrend,
  listExpenses,
  parseExpense,
  setBaseCurrency,
  updateExpense,
  type CategoryBreakdown,
  type Expense,
  type ExpensePatch,
  type MonthlySummary as MonthlySummaryResponse,
  type NewExpense,
  type ParseResponse,
  type Summary,
  type Trend,
} from "./api";
import { formatMoney } from "./format";
import { BaseCurrencyPicker } from "./components/BaseCurrencyPicker";
import { CurrencyChoice } from "./components/CurrencyChoice";
import { CategoryPie } from "./components/CategoryPie";
import { MonthlySummary } from "./components/MonthlySummary";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";

const RECENT_COUNT = 10;

export default function App() {
  const [sentence, setSentence] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<ParseResponse | null>(null);
  /**
   * Counts parses, and is used as the confirm step's `key`.
   *
   * The confirm step copies the parser's guesses into its own state so they can
   * be edited, and a `useState` initial value is only read when a component
   * first appears. Without a changing key, React reuses the component that is
   * already on screen, those initial values are never read again, and a second
   * sentence shows the previous interpretation. Changing the key makes React
   * treat each parse as a new component, which resets the fields.
   */
  const [reviewId, setReviewId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Expense | null>(null);

  const [recent, setRecent] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * The written summary is kept separate from the dashboard's own state.
   *
   * It is not fetched with the rest: it is the only thing on the page that can
   * cost money and take a second, so it waits behind a button. Its error is
   * separate too, because a provider having a bad day should put a message
   * inside that one card rather than at the top of a page that is otherwise
   * working perfectly well.
   */
  const [monthly, setMonthly] = useState<MonthlySummaryResponse | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  /**
   * The currency every total on the page is reported in.
   *
   * Held here because four components need it to format a number, and because
   * changing it has to refetch everything: the endpoint rewrites the stored base
   * figures, so the cards, both charts and the list are all stale the moment it
   * returns.
   */
  const [currency, setCurrency] = useState("EUR");
  const [currencySaving, setCurrencySaving] = useState(false);
  /**
   * Null until the first load answers. Three states rather than two: not known
   * yet, known and answered, known and not answered — and the page must not
   * flash the chooser at somebody who chose months ago just because the request
   * has not landed.
   */
  const [currencyChosen, setCurrencyChosen] = useState<boolean | null>(null);
  const [currencies, setCurrencies] = useState<string[]>([]);
  /** Off by default. When off there is one currency, so the UI stops asking. */
  const [conversionEnabled, setConversionEnabled] = useState(false);

  /**
   * Which row is being edited, if any.
   *
   * An id rather than a boolean, so only one row can be open at a time. Two
   * half-finished edits on screen at once would be two chances to lose changes
   * by clicking away, for no benefit — nobody is editing two expenses in
   * parallel. The error lives here too, so it can be shown inside the open row
   * rather than at the top of the page, away from the thing that failed.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  /**
   * Everything the dashboard shows, refetched together.
   *
   * The four requests go out at once rather than one after another: they do not
   * depend on each other, and waiting for each in turn would make saving an
   * expense feel four times slower than it is.
   */
  const refresh = useCallback(async () => {
    try {
      const [list, nextSummary, nextCategories, nextTrend, settings] = await Promise.all([
        listExpenses(RECENT_COUNT),
        getSummary(),
        getCategories(),
        getTrend(),
        getSettings(),
      ]);
      setCurrency(settings.baseCurrency);
      setCurrencyChosen(settings.baseCurrencyChosen);
      setCurrencies(settings.currencies);
      setConversionEnabled(settings.conversionEnabled);
      setRecent(list.expenses);
      setTotal(list.total);
      setSummary(nextSummary);
      setCategories(nextCategories);
      setTrend(nextTrend);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load your expenses");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    if (!sentence.trim() || parsing) return;

    setParsing(true);
    setError(null);
    setJustSaved(null);

    try {
      // This asks what the sentence means. It saves nothing — the response
      // says so, and api.ts checks that it says so.
      setReview(await parseExpense(sentence.trim()));
      setReviewId((previous) => previous + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave(expense: NewExpense) {
    setSaving(true);
    setError(null);

    try {
      // The only call on this page that writes anything, and it only happens
      // because a person pressed the button.
      const saved = await createExpense(expense);
      setJustSaved(saved);
      setReview(null);
      setSentence("");
      // The summary described the totals as they were a moment ago. Leaving it
      // on screen next to freshly changed cards would have the page stating two
      // different numbers for the same month, so it is cleared rather than
      // silently going stale. Pressing the button again rewrites it.
      setMonthly(null);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? [caught.message, ...(caught.fields ?? []).map((f) => f.message)].join(" — ")
          : "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setReview(null);
    setError(null);
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(id: string, patch: ExpensePatch) {
    setSavingEdit(true);
    setEditError(null);

    try {
      await updateExpense(id, patch);
      setEditingId(null);
      // An edit can move an amount, a date or a category, so the cards, both
      // charts and the list can all be describing the old figures. The same
      // refresh the save path uses puts every one of them right at once.
      setMonthly(null);
      await refresh();
    } catch (caught) {
      // Stays open on failure. Closing the editor would throw away what the
      // person typed at the exact moment they need it back.
      setEditError(
        caught instanceof ApiError
          ? [caught.message, ...(caught.fields ?? []).map((f) => f.message)].join(" — ")
          : "Could not save that change",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleBaseCurrencyChange(next: string) {
    if (currencySaving) return;

    setCurrencySaving(true);
    setError(null);

    try {
      // The endpoint rewrites the stored base figures for every foreign row, so
      // everything on screen is stale by the time it answers. Refetching is not
      // optional here.
      await setBaseCurrency(next);
      setCurrency(next);
      setCurrencyChosen(true);
      // The written summary quoted amounts under the old symbol.
      setMonthly(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not change the currency");
    } finally {
      setCurrencySaving(false);
    }
  }

  async function handleSummarise() {
    if (monthlyLoading) return;

    setMonthlyLoading(true);
    setMonthlyError(null);

    try {
      // Reads figures, returns prose, saves nothing — api.ts asserts the
      // `saved: false` the endpoint promises, exactly as it does for a parse.
      setMonthly(await getMonthlySummary());
    } catch (caught) {
      setMonthlyError(
        caught instanceof ApiError ? caught.message : "Could not write a summary",
      );
    } finally {
      setMonthlyLoading(false);
    }
  }

  /**
   * The currency question comes before the app, not beside it.
   *
   * `currencyChosen` is null until the first request answers, and this
   * deliberately renders nothing in that gap rather than guessing. Guessing
   * false would flash the chooser at somebody who answered long ago; guessing
   * true would flash the dashboard with amounts that have no symbol yet. A blank
   * moment is the honest third option, and it lasts one request.
   */
  if (currencyChosen === false) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-20 text-slate-900">
        <CurrencyChoice
          currencies={currencies}
          saving={currencySaving}
          error={error}
          onChoose={handleBaseCurrencyChange}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-4xl space-y-10 px-6 py-14">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Expense tracker</h1>
            <p className="text-slate-500">
              Type what you spent as a sentence. Nothing is saved until you confirm it.
            </p>
          </div>

          <BaseCurrencyPicker
            value={currency}
            currencies={currencies}
            saving={currencySaving}
            onChange={handleBaseCurrencyChange}
          />
        </header>

        <section className="space-y-4">
          <form onSubmit={handleParse} className="space-y-3">
            <input
              value={sentence}
              onChange={(event) => setSentence(event.target.value)}
              placeholder="Spent 42 euros at Lidl yesterday"
              maxLength={500}
              className="w-full rounded-xl bg-white px-5 py-4 text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-accent"
            />

            <button
              type="submit"
              disabled={!sentence.trim() || parsing}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {parsing ? "Reading..." : "Read this"}
            </button>
          </form>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {justSaved && (
            <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-slate-700">
              Saved {justSaved.merchant ?? "expense"} for{" "}
              {formatMoney(justSaved.amountBase, currency)}.
            </p>
          )}
        </section>

        {review && (
          <section className="rounded-2xl bg-slate-100/70 p-6">
            <SuggestionReview
              key={reviewId}
              suggestion={review.suggestion}
              confidence={review.confidence}
              provider={review.provider}
              saving={saving}
              showCurrency={conversionEnabled}
              onSave={handleSave}
              onCancel={handleDiscard}
            />
          </section>
        )}

        {!loaded ? (
          <p className="py-16 text-center text-sm text-slate-400">Loading your expenses...</p>
        ) : (
          <>
            {summary && <SummaryCards summary={summary} currency={currency} />}

            {summary && (
              <MonthlySummary
                month={summary.from}
                summary={monthly}
                loading={monthlyLoading}
                error={monthlyError}
                onRequest={handleSummarise}
              />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {categories && (
                <CategoryPie
                  categories={categories.categories}
                  from={categories.from}
                  currency={currency}
                />
              )}
              {trend && <TrendChart points={trend.points} currency={currency} />}
            </div>

            <RecentExpenses
              expenses={recent}
              total={total}
              currency={currency}
              showCurrency={conversionEnabled}
              editingId={editingId}
              savingEdit={savingEdit}
              editError={editError}
              onEdit={handleEdit}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
            />
          </>
        )}
      </main>
    </div>
  );
}
