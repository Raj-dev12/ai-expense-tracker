import assert from "node:assert/strict";
import { test } from "node:test";
import { readQuestion, unreadWords } from "./ask-rules.js";
import type { AskRequest, StructuredQuestion } from "./types.js";

/**
 * The boundary, pinned.
 *
 * These are the rules that decide whether a question about money gets a number
 * or a refusal, and they are pure functions — no database, no network, no key.
 * The refusals matter more than the answers here: a wrong "unsupported" is a
 * mild annoyance, and a wrong answer is a figure that looks right.
 */

const CATEGORIES = ["Groceries", "Restaurants", "Travel", "Bills", "Uncategorised"];

function read(question: string): StructuredQuestion {
  const request: AskRequest = {
    question,
    today: "2026-08-31",
    baseCurrency: "EUR",
    categories: CATEGORIES,
    from: "2026-08-01",
    to: "2026-08-31",
  };
  return readQuestion(request);
}

test("the four shapes the brief asked for", async (t) => {
  await t.test("what is my highest expense", () => {
    assert.deepEqual(read("what is my highest expense"), {
      kind: "topExpenses",
      order: "highest",
      limit: 1,
      filters: { category: null, merchant: null, from: null, to: null },
    });
  });

  await t.test("biggest expense in travel", () => {
    const q = read("biggest expense in travel");
    assert.equal(q.kind, "topExpenses");
    assert.equal(q.kind === "topExpenses" && q.filters.category, "Travel");
  });

  await t.test("highest week for groceries", () => {
    const q = read("highest week for groceries");
    assert.equal(q.kind, "topBuckets");
    assert.equal(q.kind === "topBuckets" && q.bucket, "week");
    assert.equal(q.kind === "topBuckets" && q.measure, "total");
    assert.equal(q.kind === "topBuckets" && q.filters.category, "Groceries");
  });

  await t.test("which month did I spend most on restaurants", () => {
    const q = read("which month did I spend most on restaurants");
    assert.equal(q.kind, "topBuckets");
    assert.equal(q.kind === "topBuckets" && q.bucket, "month");
    assert.equal(q.kind === "topBuckets" && q.filters.category, "Restaurants");
  });
});

test("what the grammar gets for free", async (t) => {
  await t.test("counting", () => {
    const q = read("how many expenses did I have");
    assert.equal(q.kind === "aggregate" && q.measure, "count");
  });

  await t.test("averages", () => {
    const q = read("what is my average expense");
    assert.equal(q.kind === "aggregate" && q.measure, "average");
  });

  await t.test("lowest instead of highest", () => {
    const q = read("cheapest expense in travel");
    assert.equal(q.kind === "topExpenses" && q.order, "lowest");
  });

  await t.test("which category", () => {
    const q = read("which category do I spend most on");
    assert.equal(q.kind === "topBuckets" && q.bucket, "category");
  });

  await t.test("which shop", () => {
    const q = read("which shop do I spend most at");
    assert.equal(q.kind === "topBuckets" && q.bucket, "merchant");
  });
});

test("an expense typed into the question box is signposted, not refused", async (t) => {
  for (const text of ["42 euros at Lidl yesterday", "12.50 lunch", "spent 30 on coffee"]) {
    await t.test(text, () => {
      assert.equal(read(text).kind, "looksLikeExpense");
    });
  }

  // A merchant is not required. "42 euros yesterday" is every bit as much an
  // expense, and it is the version most likely to be typed in a hurry.
  await t.test("no merchant named", () => {
    assert.equal(read("42 euros yesterday").kind, "looksLikeExpense");
  });

  // A question that happens to contain a number is still a question.
  await t.test("a number inside a real question", () => {
    assert.notEqual(read("what were my top 3 expenses").kind, "looksLikeExpense");
  });
});

test("out of scope is refused rather than approximated", async (t) => {
  const refusals: Array<[string, string]> = [
    ["why did I spend so much on food", "why"],
    ["will I go over budget next month", "the future"],
    ["should I cut back on restaurants", "advice"],
    ["am I spending more on food than transport", "comparison"],
    ["what is the meaning of life", "nothing to do with spending"],
  ];

  for (const [question, why] of refusals) {
    await t.test(`${why}: ${question}`, () => {
      assert.equal(read(question).kind, "unsupported", `"${question}" should be refused`);
    });
  }
});

test("a constraint that cannot be read is never silently dropped", async (t) => {
  // This is the rule the whole file exists for. Answering the wider question
  // produces a real number that answers something nobody asked.
  await t.test("a subject that is not a category", () => {
    const q = read("how much did I spend on food");
    assert.equal(q.kind, "unsupported");
    assert.match(q.kind === "unsupported" ? q.reason : "", /food/);
  });

  await t.test("a date phrase that cannot be pinned down", () => {
    assert.equal(read("what did I spend last fortnight").kind, "unsupported");
  });

  await t.test("a category that does exist is not refused", () => {
    assert.notEqual(read("how much did I spend on groceries").kind, "unsupported");
  });
});

/**
 * The leak this whole guard exists for.
 *
 * "Lowest food expense" walked past three preposition-shaped guards and returned
 * the lowest expense overall — a correct number answering a question nobody
 * asked. A noun narrows a question perfectly well without a preposition in front
 * of it, so the check has to account for every word rather than enumerate the
 * shapes a constraint can take.
 *
 * Every query shape is covered here on purpose: the point of enforcing this in
 * one place is that a fourth branch cannot miss it, and these are what would
 * fail if it were moved back into the branches.
 */
test("a subject that is not a category is refused on every branch", async (t) => {
  const leaks: Array<[string, string]> = [
    ["lowest food expense", "topExpenses"],
    ["highest food week", "topBuckets by week"],
    ["which month for food", "topBuckets by month"],
    ["biggest food shop", "topBuckets by merchant"],
    ["how much did I spend on food", "aggregate"],
    ["what is my average food expense", "aggregate with a measure"],
    ["busiest food day", "topBuckets by day"],
    ["which food category is highest", "topBuckets by category"],
  ];

  for (const [question, branch] of leaks) {
    await t.test(`${branch}: ${question}`, () => {
      const q = read(question);
      assert.equal(q.kind, "unsupported", `"${question}" leaked through ${branch}`);
      assert.match(q.kind === "unsupported" ? q.reason : "", /food/);
    });
  }
});

test("the guard names what it could not read, and only that", async (t) => {
  await t.test("a word that is not understood", () => {
    assert.deepEqual(unreadWords("lowest food expense", { category: null, merchant: null }), [
      "food",
    ]);
  });

  await t.test("a matched category is consumed", () => {
    assert.deepEqual(unreadWords("lowest groceries expense", { category: "Groceries", merchant: null }), []);
  });

  await t.test("a multi-word shop is consumed whole", () => {
    assert.deepEqual(
      unreadWords("biggest expense at The Breakfast Club", {
        category: null,
        merchant: "The Breakfast Club",
      }),
      [],
    );
  });

  await t.test("the four examples leave nothing unread", () => {
    for (const [question, matched] of [
      ["what is my highest expense", { category: null, merchant: null }],
      ["biggest expense in travel", { category: "Travel", merchant: null }],
      ["highest week for groceries", { category: "Groceries", merchant: null }],
      ["which month did I spend most on restaurants", { category: "Restaurants", merchant: null }],
    ] as const) {
      assert.deepEqual(unreadWords(question, matched), [], question);
    }
  });

  // The whitelist must never grow a domain noun. That would be the original bug
  // wearing the guard's clothes.
  await t.test("an unknown shop-like word is still caught", () => {
    assert.deepEqual(unreadWords("highest petrol expense", { category: null, merchant: null }), [
      "petrol",
    ]);
  });
});

test("dates the rules do understand", async (t) => {
  await t.test("a named month resolves to that month", () => {
    const q = read("highest expense in July");
    assert.equal(q.kind === "topExpenses" && q.filters.from, "2026-07-01");
    assert.equal(q.kind === "topExpenses" && q.filters.to, "2026-07-31");
  });

  // Asked in August, "December" is the December that has happened.
  await t.test("a month later in the year means last year", () => {
    const q = read("highest expense in December");
    assert.equal(q.kind === "topExpenses" && q.filters.from, "2025-12-01");
    assert.equal(q.kind === "topExpenses" && q.filters.to, "2025-12-31");
  });

  await t.test("today", () => {
    const q = read("how much did I spend today");
    assert.equal(q.kind === "aggregate" && q.filters.from, "2026-08-31");
  });
});

test("half a question is never answered silently", async (t) => {
  /*
    The reported failure. Every existing guard passed it: every word is known,
    the category and the date both matched, nothing was left unread. It then
    answered the amount and dropped "where" without a word — a correct number
    answering half of what was asked, which is the same failure as answering
    "why did I spend so much on food" with a figure.

    The whitelist could not see it. "Where" is a perfectly known word; it is not
    an unrecognised subject but an unrecognised *ask*, and only counting the
    asks finds it.
  */
  const compound = read("how much did I spend on restaurants today and where did I spend it");

  await t.test("the reported question becomes two queries, not one", () => {
    assert.equal(compound.kind, "compound");
    if (compound.kind !== "compound") return;
    assert.equal(compound.parts.length, 2);
    assert.deepEqual(compound.unanswered, []);
  });

  await t.test("the amount and the shop are both asked for", () => {
    if (compound.kind !== "compound") throw new Error("expected a compound");
    const [amount, where] = compound.parts;
    assert.equal(amount?.kind, "aggregate");
    if (amount?.kind === "aggregate") assert.equal(amount.measure, "total");
    assert.equal(where?.kind, "topBuckets");
    if (where?.kind === "topBuckets") assert.equal(where.bucket, "merchant");
  });

  await t.test("both parts keep the constraints the sentence set", () => {
    if (compound.kind !== "compound") throw new Error("expected a compound");
    // "Where did I spend it" means the restaurant spending of that day, not
    // everything. Splitting the sentence into clauses would have widened the
    // second part into a different question.
    for (const part of compound.parts) {
      assert.equal(part.filters.category, "Restaurants");
      assert.equal(part.filters.from, "2026-08-31");
      assert.equal(part.filters.to, "2026-08-31");
    }
  });

  await t.test("the parts follow the order of the sentence", () => {
    const asked = read("when did I spend the most and where did I spend it");
    if (asked.kind !== "compound") throw new Error("expected a compound");
    const buckets = asked.parts.map((part) => (part.kind === "topBuckets" ? part.bucket : null));
    assert.deepEqual(buckets, ["day", "merchant"]);
  });

  await t.test("an ask with no shape is named, never dropped", () => {
    // The half that could be answered still is. The half that cannot is said
    // out loud, which is the whole point — answering one and going quiet about
    // the other is the original bug in a smaller form.
    const partial = read("how much did I spend and who did I pay");
    assert.equal(partial.kind, "compound");
    if (partial.kind !== "compound") return;
    assert.equal(partial.parts.length, 1);
    assert.deepEqual(partial.unanswered, ["who"]);
  });

  await t.test("a question with nothing answerable in it is still refused", () => {
    const none = read("who did I pay and who else was there");
    assert.equal(none.kind, "unsupported");
  });

  /*
    The half that must keep working. A grouping plus a measure is one ask, not
    two — "spend" in "which month did I spend most" supplies the measure for
    "which month" rather than starting a second question. Counting any question
    word rather than interrogative heads would have split all of these.
  */
  await t.test("a grouping with a measure is still one question", () => {
    for (const question of [
      "which month did I spend most on restaurants",
      "highest week for groceries",
      "what is my highest expense",
      "which shop did I spend the most at",
      "how much did I spend on restaurants today",
    ]) {
      assert.notEqual(read(question).kind, "compound", question);
      assert.notEqual(read(question).kind, "unsupported", question);
    }
  });

  await t.test("a compound cannot contain a refusal or another compound", () => {
    // Structural, not conventional: parts are typed to the three answerable
    // shapes, so there is no way to express a nested one.
    if (compound.kind !== "compound") throw new Error("expected a compound");
    for (const part of compound.parts) {
      assert.ok(["aggregate", "topExpenses", "topBuckets"].includes(part.kind), part.kind);
    }
  });

  await t.test("an unread constraint still wins over splitting the question", () => {
    // A word nobody understood is the more actionable complaint, and answering
    // two halves of a question that was misread is worse than answering none.
    const question = read("how much did I spend on zzz and where did I spend it");
    assert.equal(question.kind, "unsupported");
    if (question.kind !== "unsupported") return;
    assert.match(question.reason, /"zzz"/);
  });
});

test("asks that were known words but no shape read", async (t) => {
  /*
    "Where" and "when" were in the whitelist, so they passed the constraint
    guard, and no branch looked at them — "where did I spend the most" fell
    through to a plain total. That is the same silent half-answer as the
    compound case, reached by a different route, so they are answered rather
    than merely tolerated.
  */
  await t.test("where is a question about shops", () => {
    const question = read("where did I spend the most this month");
    assert.equal(question.kind, "topBuckets");
    if (question.kind !== "topBuckets") return;
    assert.equal(question.bucket, "merchant");
  });

  await t.test("when is a question about days", () => {
    const question = read("when did I spend the most this month");
    assert.equal(question.kind, "topBuckets");
    if (question.kind !== "topBuckets") return;
    assert.equal(question.bucket, "day");
  });

  /*
    And the misread this uncovered: "this month" had already been read as the
    date range, then read a second time as a grouping. "Where did I spend the
    most this month" came back as the highest *month* — a real figure answering
    a question about shops.
  */
  await t.test("a period phrase is the window, not the grouping", () => {
    const where = read("where did I spend the most this month");
    if (where.kind !== "topBuckets") throw new Error("expected buckets");
    assert.equal(where.bucket, "merchant");

    const counted = read("how many expenses this month");
    assert.equal(counted.kind, "aggregate");
    if (counted.kind !== "aggregate") return;
    assert.equal(counted.measure, "count");
  });

  await t.test("a grouping word without a period phrase still groups", () => {
    const question = read("which month did I spend most on restaurants");
    assert.equal(question.kind, "topBuckets");
    if (question.kind !== "topBuckets") return;
    assert.equal(question.bucket, "month");
  });
});
