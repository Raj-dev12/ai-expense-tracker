import assert from "node:assert/strict";
import test from "node:test";
import { MIN_BASELINE_EXPENSES, baselineFor } from "./baseline.js";

/**
 * When a comparison is worth stating at all.
 *
 * The bug these pin: on the 1st of a month the period is one day and the
 * stretch before it is one day, so a quiet day followed by a normal one
 * reported "2586% more". The arithmetic was right and the sentence meant
 * nothing. The fix is not a cap on the number — capping 2586% to "over 500%"
 * still answers a question that should not have been asked — it is a test of
 * whether the baseline is a sample at all.
 */

test("a baseline with nothing in it", () => {
  assert.equal(baselineFor(0, 0), "empty");
  // A count without a total is still nothing to divide by.
  assert.equal(baselineFor(3, 0), "empty");
});

test("a baseline too thin to divide by", () => {
  // The reported case: one expense the day before, one the day after.
  assert.equal(baselineFor(1, 19.6), "too-small");
  assert.equal(baselineFor(2, 500), "too-small");
});

test("a baseline that is a sample", () => {
  assert.equal(baselineFor(MIN_BASELINE_EXPENSES, 100), "usable");
  assert.equal(baselineFor(36, 1975.22), "usable");
});

test("the rule is about the baseline, not the size of the answer", () => {
  // A very large change against a real baseline is still worth stating: it is
  // surprising, not meaningless. Nothing here looks at the current period.
  assert.equal(baselineFor(12, 4.2), "usable");
  // And a small change against a thin one is still not.
  assert.equal(baselineFor(1, 1000), "too-small");
});
