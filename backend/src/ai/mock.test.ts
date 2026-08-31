import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readNumber } from "./extract.js";
import { mockParser } from "./mock.js";

const TODAY = "2026-08-31";

async function parse(sentence: string) {
  const { suggestion } = await mockParser.parseExpense({ sentence, today: TODAY });
  return suggestion;
}

/**
 * The rule these check:
 *
 *   1. Both `.` and `,` present  -> whichever is last is the decimal separator.
 *   2. One kind, more than once  -> grouping.
 *   3. One kind, exactly once    -> grouping only if exactly three digits follow
 *                                   and one to three digits come before.
 */
describe("reading a written number", () => {
  const cases: Array<[string, number]> = [
    // Rule 3, decimal: not three digits after, so it is a decimal separator.
    ["14,6", 14.6],
    ["23,40", 23.4],
    ["12.50", 12.5],
    ["0,5", 0.5],
    ["1234,5", 1234.5],
    ["9,99", 9.99],

    // Rule 3, grouping: exactly three digits after, one to three before.
    ["1,200", 1200],
    ["1.200", 1200],
    ["100,000", 100000],
    ["999.999", 999999],

    // Rule 1: both kinds, the last one wins.
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234.567,89", 1234567.89],
    ["1,234,567.89", 1234567.89],

    // Rule 2: one kind, repeated, so it is grouping.
    ["1.234.567", 1234567],
    ["1,234,567", 1234567],

    // No separator at all.
    ["42", 42],
    ["7", 7],
  ];

  for (const [written, expected] of cases) {
    it(`reads ${written} as ${expected}`, () => {
      assert.equal(readNumber(written), expected);
    });
  }
});

describe("finding the amount in a sentence", () => {
  it("reads a single digit after a decimal comma", async () => {
    // The bug: this used to come back as 146.
    const suggestion = await parse("coffee and tea at k market 14,6");
    assert.equal(suggestion.amount, 14.6);
  });

  it("still reads two digits after a decimal comma", async () => {
    assert.equal((await parse("groceries 23,40 at Lidl")).amount, 23.4);
  });

  it("treats a three-digit group as thousands", async () => {
    assert.equal((await parse("1,200 eur flight to Rome")).amount, 1200);
  });

  it("handles a European-written number with both separators", async () => {
    assert.equal((await parse("paid 1.234,56 eur at Stockmann")).amount, 1234.56);
  });

  it("handles an English-written number with both separators", async () => {
    assert.equal((await parse("paid 1,234.56 eur at Stockmann")).amount, 1234.56);
  });

  it("does not mistake a written date for the amount", async () => {
    const suggestion = await parse("netflix on 2026-07-14");
    assert.equal(suggestion.amount, null);
    assert.equal(suggestion.expenseDate, "2026-07-14");
  });

  it("returns null rather than inventing an amount", async () => {
    assert.equal((await parse("coffee")).amount, null);
  });
});

describe("finding the merchant", () => {
  it("finds a lowercase multi-word name after a preposition", async () => {
    // The bug: this used to come back as null because of the missing capitals.
    assert.equal((await parse("coffee and tea at k market 14,6")).merchant, "K Market");
  });

  it("finds a lowercase single-word name", async () => {
    assert.equal((await parse("spent 42 euros at lidl yesterday")).merchant, "Lidl");
  });

  it("still finds a capitalised name", async () => {
    assert.equal((await parse("spent 42 euros at Lidl yesterday")).merchant, "Lidl");
  });

  it("gives the same answer whatever the capitalisation", async () => {
    const written = ["at k-market", "at K-Market", "at K-MARKET"];
    const found = await Promise.all(written.map(async (w) => (await parse(`20 eur ${w}`)).merchant));
    assert.deepEqual(found, ["K-Market", "K-Market", "K-MARKET"]);
  });

  it("stops at a date word", async () => {
    assert.equal((await parse("paid 12 eur at cafe regatta on monday")).merchant, "Cafe Regatta");
  });

  it("stops at another preposition", async () => {
    assert.equal(
      (await parse("paid 89.99 USD on Amazon for headphones 3 days ago")).merchant,
      "Amazon",
    );
  });

  it("stops at a number", async () => {
    assert.equal((await parse("at the corner shop 9,50")).merchant, "Corner Shop");
  });

  it("does not mistake a currency for a shop", async () => {
    assert.equal((await parse("paid 20 in dollars")).merchant, null);
  });

  it("returns null when no shop is named", async () => {
    assert.equal((await parse("coffee 4 eur")).merchant, null);
  });
});

describe("the whole suggestion still holds together", () => {
  it("reads the reported sentence correctly", async () => {
    const suggestion = await parse("coffee and tea at k market 14,6");
    assert.equal(suggestion.amount, 14.6);
    assert.equal(suggestion.merchant, "K Market");
    assert.equal(suggestion.currency, "EUR");
    assert.equal(suggestion.expenseDate, TODAY);
  });
});
