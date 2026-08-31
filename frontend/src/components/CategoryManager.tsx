import { useState } from "react";
import type { Category, DeleteMode } from "../api";

/**
 * Everything you can do to the list of categories, in one place.
 *
 * Adding used to live in the category dropdown on the add form, which put two
 * different jobs in one control: choosing a category and maintaining the list of
 * them. A dropdown that sometimes turns into a text box is a dropdown you have
 * to read carefully before using. So the dropdown now only chooses, and this
 * panel owns the list — add, rename, delete.
 *
 * The trade is that making a category mid-expense means coming here first. That
 * is a real cost, and it buys a control that does one thing.
 */
export function CategoryManager({
  categories,
  uncategorised,
  busy,
  error,
  onAdd,
  onRename,
  onDelete,
}: {
  categories: Category[];
  /** The one category that cannot be renamed or removed. */
  uncategorised: string;
  busy: boolean;
  error: string | null;
  onAdd: (name: string) => void;
  onRename: (name: string, to: string) => void;
  onDelete: (name: string, mode: DeleteMode) => void;
}) {
  const [adding, setAdding] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const chosen = categories.find((category) => category.name === confirming);
  const beingRenamed = categories.find((category) => category.name === renaming);

  function startRename(category: Category) {
    setRenaming(category.name);
    setRenameDraft(category.name);
    setConfirming(null);
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-medium text-slate-900">Categories</h2>
        <span className="text-xs text-slate-400">{categories.length}</span>
      </header>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <form
        className="mb-3 flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!adding.trim() || busy) return;
          onAdd(adding.trim());
          setAdding("");
        }}
      >
        <input
          value={adding}
          maxLength={40}
          placeholder="Add a category"
          onChange={(event) => setAdding(event.target.value)}
          className="flex-1 rounded-xl bg-white px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-300 focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!adding.trim() || busy}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>

      <ul className="divide-y divide-slate-100">
        {categories.map((category) => (
          <li key={category.name} className="py-2">
            {renaming === category.name && beingRenamed ? (
              <form
                className="space-y-3 rounded-xl bg-slate-50 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!renameDraft.trim() || busy) return;
                  onRename(category.name, renameDraft.trim());
                  setRenaming(null);
                }}
              >
                <input
                  value={renameDraft}
                  autoFocus
                  maxLength={40}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  className="w-full rounded-xl bg-white px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-accent"
                />

                {/* The count is the reason this needs confirming at all. An
                    expense stores its category as text, so a rename rewrites
                    every one of them — which is worth saying before it happens
                    rather than reporting afterwards. */}
                <p className="text-xs text-slate-500">
                  {beingRenamed.expenseCount === 0
                    ? "Nothing is filed under it, so only the name changes."
                    : `This will also update ${beingRenamed.expenseCount} ${
                        beingRenamed.expenseCount === 1 ? "expense" : "expenses"
                      } filed under it.`}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={!renameDraft.trim() || renameDraft.trim() === category.name || busy}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="group flex items-baseline gap-4">
                <span className="flex-1 truncate text-sm text-slate-900">{category.name}</span>
                <span className="text-xs tabular-nums text-slate-400">
                  {category.expenseCount} {category.expenseCount === 1 ? "expense" : "expenses"}
                </span>

                {category.name === uncategorised ? (
                  // Said rather than hidden. A missing button invites a hunt; a
                  // reason closes the question.
                  <span
                    className="text-xs text-slate-300"
                    title="Expenses move here when their category is deleted"
                  >
                    kept
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startRename(category)}
                      disabled={busy}
                      className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-accent focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(category.name);
                        setRenaming(null);
                      }}
                      disabled={busy}
                      className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-700 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}

            {confirming === category.name && chosen && (
              <div className="mt-2 space-y-3 rounded-xl bg-slate-50 p-4">
                {chosen.expenseCount === 0 ? (
                  <>
                    <p className="text-sm text-slate-700">
                      Delete <strong>{chosen.name}</strong>? Nothing is filed under it.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onDelete(chosen.name, "reassign");
                          setConfirming(null);
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
                      >
                        Delete it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* "Delete Groceries?" and "Delete Groceries and the 28
                        expenses in it?" are different questions, and only one of
                        them is honest. */}
                    <p className="text-sm text-slate-700">
                      <strong>{chosen.name}</strong> holds {chosen.expenseCount}{" "}
                      {chosen.expenseCount === 1 ? "expense" : "expenses"}. What should happen to{" "}
                      {chosen.expenseCount === 1 ? "it" : "them"}?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onDelete(chosen.name, "reassign");
                          setConfirming(null);
                        }}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                      >
                        Move to {uncategorised}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          onDelete(chosen.name, "delete");
                          setConfirming(null);
                        }}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
                      >
                        Delete {chosen.expenseCount === 1 ? "it" : "them"} too
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:text-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">Deleting expenses cannot be undone.</p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
