import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  askQuestion,
  createCategory,
  createExpense,
  deleteCategory,
  renameCategory,
  deleteExpense,
  getCategories,
  getCategoryList,
  getMonthlySummary,
  getSettings,
  getSummary,
  getTrend,
  listExpenses,
  parseExpense,
  setBaseCurrency,
  updateExpense,
  type Category,
  type CategoryBreakdown,
  type DeleteMode,
  type Expense,
  type ExpensePatch,
  type AskAnswer,
  type MonthlySummary as MonthlySummaryResponse,
  type NewExpense,
  type ParseResponse,
  type Summary,
  type Trend,
} from "./api";
import { formatMoney, todayIso } from "./format";
import { windowFor, type Period } from "./periods";
import { BaseCurrencyPicker } from "./components/BaseCurrencyPicker";
import { CurrencyChoice } from "./components/CurrencyChoice";
import { CategoryManager } from "./components/CategoryManager";
import { CategoryPie, type PieSlice } from "./components/CategoryPie";
import { DayView } from "./components/DayView";
import { AnalysisCard } from "./components/AnalysisCard";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";
import { SummaryCards } from "./components/SummaryCards";
import { TrendChart } from "./components/TrendChart";

/**
 * How many expenses the list asks for.
 *
 * The whole list, in one request, up to what the API will return. A hundred rows
 * is nothing to fetch or draw, and the list scrolls inside a fixed box rather
 * than growing the page — so there is no reason to page it, and paging would
 * mean a scroll listener, a loading state and an off-by-one to save work that is
 * already free. Above this the header says "showing 200 of N" and stays honest.
 */
const EXPENSE_LIMIT = 200;

/**
 * Mirrors the backend constant. It is one word for a category that cannot be
 * renamed or removed, and the alternative is another field on the settings
 * response for something that will never change.
 */
const UNCATEGORISED = "Uncategorised";

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
  /**
   * The window the summary cards, the written summary and the pie all describe.
   *
   * One piece of state for three things on purpose: numbers, prose and slices
   * that could disagree about which stretch of time they cover would be worse
   * than having no period control at all.
   *
   * The trend chart deliberately does not follow it. That chart is about change
   * over a long run, and squeezing it into "today" would leave a single point.
   */
  const [period, setPeriod] = useState<Period>("month");

  const [monthly, setMonthly] = useState<MonthlySummaryResponse | null>(null);
  const [monthlyAt, setMonthlyAt] = useState<Date | null>(null);

  /**
   * The question box: what was asked, and what came back.
   *
   * Separate from the summary because they fail separately — a question the
   * parser cannot express should not blank a summary somebody is reading.
   */
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
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
   * The categories that exist, refetched with everything else.
   *
   * They live at page level because three places need them at once: the add
   * box, the editor inside a row, and the list that deletes them. Fetching them
   * in each would mean three copies that disagree the moment one changes.
   */
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  /**
   * Which row is being edited, if any.
   *
   * An id rather than a boolean, so only one row can be open at a time. Two
   * half-finished edits on screen at once would be two chances to lose changes
   * by clicking away, for no benefit — nobody is editing two expenses in
   * parallel. The error lives here too, so it can be shown inside the open row
   * rather than at the top of the page, away from the thing that failed.
   */
  /**
   * The day view: which day, and what was spent on it.
   *
   * Fetched separately from the dashboard because it answers a different
   * question and changes for a different reason — moving to another day should
   * not refetch the charts, and saving an expense should not reset the day you
   * were looking at.
   */
  /**
   * The category whose expenses are open under the pie, and what they are.
   *
   * Fetched here like everything else that talks to the API, and keyed on the
   * same window the pie is drawing so the panel can never describe a different
   * period from the chart above it.
   */
  /**
   * The pie slice whose expenses are open, held whole rather than by name.
   *
   * A folded slice stands for several categories, and the panel has to ask for
   * exactly that set. Holding only the name meant asking for the literal
   * category "Other" — which exists — so the panel listed one expense under a
   * tooltip describing five.
   */
  const [pieSlice, setPieSlice] = useState<PieSlice | null>(null);
  const [pieExpenses, setPieExpenses] = useState<Expense[]>([]);
  const [pieLoading, setPieLoading] = useState(false);

  const [day, setDay] = useState(todayIso);
  const [dayExpenses, setDayExpenses] = useState<Expense[]>([]);
  const [dayLoading, setDayLoading] = useState(true);
  /**
   * Bumped whenever anything is written, so the day view refetches without the
   * dashboard's refresh needing to know which day is on screen. The alternative
   * — putting `day` in refresh's dependencies — would refetch all ninety-odd
   * expenses and both charts every time somebody changed the date.
   *
   * The cost is one duplicated day request on first load, because the initial
   * refresh bumps this too. That is cheaper than bumping it from each of the
   * seven write handlers, where the bug would be forgetting one.
   */
  const [writes, setWrites] = useState(0);

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
    setWrites((count) => count + 1);
    const window = windowFor(period);

    try {
      const [list, nextSummary, nextCategories, nextTrend, settings, allCategories] =
        await Promise.all([
              listExpenses({ limit: EXPENSE_LIMIT }),
          getSummary(window),
          getCategories(window),
          getTrend(),
          getSettings(),
          getCategoryList(),
        ]);
      setCategoryList(allCategories.categories);
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
  }, [period]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pieSlice || !categories) return;

    let cancelled = false;
    setPieLoading(true);

    listExpenses({
      from: categories.from,
      to: categories.to,
      categories: pieSlice.members,
      limit: EXPENSE_LIMIT,
    })
      .then((result) => {
        if (!cancelled) setPieExpenses(result.expenses);
      })
      .catch(() => {
        if (!cancelled) setPieExpenses([]);
      })
      .finally(() => {
        if (!cancelled) setPieLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pieSlice, categories, writes]);

  useEffect(() => {
    let cancelled = false;
    setDayLoading(true);

    // A day is a range whose ends are the same date, which is why this needs no
    // endpoint of its own.
    listExpenses({ from: day, to: day, limit: EXPENSE_LIMIT })
      .then((result) => {
        // Changing the date twice quickly can land the replies out of order, and
        // the slower one would overwrite the day actually on screen.
        if (!cancelled) setDayExpenses(result.expenses);
      })
      .catch(() => {
        if (!cancelled) setDayExpenses([]);
      })
      .finally(() => {
        if (!cancelled) setDayLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [day, writes]);

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

  async function handleAddCategory(name: string) {
    setCategoryBusy(true);
    setCategoryError(null);

    try {
      await createCategory(name);
      // Only the category list changed, but refreshing everything is one request
      // more and keeps a single path for "the data moved".
      await refresh();
    } catch (caught) {
      setCategoryError(
        caught instanceof ApiError ? caught.message : "Could not add that category",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  /**
   * Rename a category and every expense filed under it.
   *
   * The expenses are the reason this refreshes the whole page rather than just
   * the list: they store the category as text, so a rename rewrites rows that
   * the charts, the pie legend and the recent list are all drawing from.
   */
  async function handleRenameCategory(name: string, to: string) {
    setCategoryBusy(true);
    setCategoryError(null);

    try {
      await renameCategory(name, to);
      setMonthly(null);
      await refresh();
    } catch (caught) {
      setCategoryError(
        caught instanceof ApiError ? caught.message : "Could not rename that category",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  async function handleDeleteCategory(name: string, mode: DeleteMode) {
    setCategoryBusy(true);
    setCategoryError(null);

    try {
      await deleteCategory(name, mode);
      // Deleting with "delete" removes expenses, and even "reassign" moves them
      // between slices of the pie. Everything on the page is stale either way.
      setMonthly(null);
      await refresh();
    } catch (caught) {
      setCategoryError(
        caught instanceof ApiError ? caught.message : "Could not delete that category",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  async function handleDeleteExpense(id: string) {
    setError(null);

    try {
      await deleteExpense(id);
      setMonthly(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete that expense");
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

  // Stable identity, so the pie's outside-click effect is not torn down and
  // rebuilt on every render of the page.
  const dismissPieCategory = useCallback(() => setPieSlice(null), []);

  function handlePeriodChange(next: Period) {
    setPeriod(next);
    // The sentence on screen describes the period that was selected when it was
    // written. Leaving it there under a new heading would be the card claiming
    // to summarise something it never looked at.
    setMonthly(null);
    setMonthlyAt(null);
    setPieSlice(null);
    // The answer was computed over the old period, so it would be describing a
    // stretch of time the card no longer shows.
    setAnswer(null);
    setAskError(null);
  }

  async function handleAsk(question: string) {
    if (asking) return;

    setAsking(true);
    setAskError(null);

    try {
      // Scoped to the period the card is showing, unless the question names its
      // own dates — in which case the parser fills them in and they win.
      setAnswer(await askQuestion(question, windowFor(period)));
    } catch (caught) {
      setAskError(caught instanceof ApiError ? caught.message : "Could not answer that");
    } finally {
      setAsking(false);
    }
  }

  async function handleSummarise() {
    if (monthlyLoading) return;

    setMonthlyLoading(true);
    setMonthlyError(null);

    try {
      // Reads figures, returns prose, saves nothing — api.ts asserts the
      // `saved: false` the endpoint promises, exactly as it does for a parse.
      setMonthly(await getMonthlySummary(windowFor(period)));
      setMonthlyAt(new Date());
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
              categories={categoryList.map((category) => category.name)}
              onSave={handleSave}
              onCancel={handleDiscard}
            />
          </section>
        )}

        {!loaded ? (
          <p className="py-16 text-center text-sm text-slate-400">Loading your expenses...</p>
        ) : (
          <>
            {summary && (
              <SummaryCards summary={summary} currency={currency} period={period} />
            )}

            {summary && (
              <AnalysisCard
                period={period}
                onPeriodChange={handlePeriodChange}
                summary={monthly}
                writtenAt={monthlyAt}
                loading={monthlyLoading}
                error={monthlyError}
                onRequest={handleSummarise}
                answer={answer}
                asking={asking}
                askError={askError}
                onAsk={handleAsk}
              />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {categories && (
                <CategoryPie
                  categories={categories.categories}
                  from={categories.from}
                  currency={currency}
                  selected={pieSlice}
                  selectedExpenses={pieExpenses}
                  selectedLoading={pieLoading}
                  onSelect={setPieSlice}
                  onDismiss={dismissPieCategory}
                />
              )}
              {trend && <TrendChart points={trend.points} currency={currency} />}
            </div>

            <DayView
              date={day}
              expenses={dayExpenses}
              currency={currency}
              loading={dayLoading}
              onDateChange={setDay}
            />

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
              categories={categoryList.map((category) => category.name)}
              onDelete={handleDeleteExpense}
            />

            <CategoryManager
              categories={categoryList}
              uncategorised={UNCATEGORISED}
              busy={categoryBusy}
              error={categoryError}
              onAdd={handleAddCategory}
              onRename={handleRenameCategory}
              onDelete={handleDeleteCategory}
            />
          </>
        )}
      </main>
    </div>
  );
}
