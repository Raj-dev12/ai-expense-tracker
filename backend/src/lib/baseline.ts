/**
 * How many expenses the stretch before has to hold before a percentage against
 * it means anything.
 *
 * With one expense in the baseline, the percentage is not describing a trend —
 * it is describing whether a single purchase happened to fall inside the window.
 * On the 1st of a month the current period is one day and the stretch before it
 * is one day, and a quiet day before a normal one produced "2586% more", which
 * is arithmetically correct and says nothing at all.
 *
 * This is deliberately not a cap on the number. Clamping a real 2586% to "over
 * 500%" would still be answering a question that should not have been asked —
 * the problem is the baseline, not the size of the answer. So the test is about
 * the baseline: fewer than three expenses is not a sample, and the honest reply
 * is to say there is not enough to compare against rather than to publish a
 * figure that looks like information.
 */
export const MIN_BASELINE_EXPENSES = 3;

/** Why a period has no percentage change, when it has none. */
export type Baseline =
  /** The stretch before holds enough to compare against. */
  | "usable"
  /** Nothing at all was recorded then. */
  | "empty"
  /** Something was, but too little for a percentage to mean anything. */
  | "too-small";

export function baselineFor(previousCount: number, previousTotal: number): Baseline {
  if (previousCount === 0 || previousTotal <= 0) return "empty";
  if (previousCount < MIN_BASELINE_EXPENSES) return "too-small";
  return "usable";
}
