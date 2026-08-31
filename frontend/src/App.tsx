import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createExpense,
  listExpenses,
  parseExpense,
  type Expense,
  type NewExpense,
  type ParseResponse,
} from "./api";
import { RecentExpenses } from "./components/RecentExpenses";
import { SuggestionReview } from "./components/SuggestionReview";

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

  const refreshRecent = useCallback(async () => {
    try {
      const result = await listExpenses(5);
      setRecent(result.expenses);
      setTotal(result.total);
    } catch {
      // A failed refresh should not bury whatever else is on screen; the list
      // simply stays as it was.
    }
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

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
      await refreshRecent();
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-2xl space-y-12 px-6 py-16">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Expense tracker</h1>
          <p className="text-slate-500">
            Type what you spent as a sentence. Nothing is saved until you confirm it.
          </p>
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
              Saved {justSaved.merchant ?? "expense"} for {justSaved.amountEur} euros.
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
              onSave={handleSave}
              onCancel={handleDiscard}
            />
          </section>
        )}

        <section>
          <RecentExpenses expenses={recent} total={total} />
        </section>
      </main>
    </div>
  );
}
