import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDate } from "./extract.js";
import { mockParser } from "./mock.js";

const TODAY = "2026-08-31";

async function parse(sentence: string) {
  const { suggestion } = await mockParser.parseExpense({ sentence, today: TODAY });
  return suggestion;
}

describe("written dates a Finnish user would type", () => {
  // Day first, then month, then a two- or four-digit year. The separator may be
  // a dot, comma, slash or hyphen, but must be the same one twice.
  const cases: Array<[string, string]> = [
    ["31.08.2026", "2026-08-31"],
    ["31.8.2026", "2026-08-31"],
    ["31.08.26", "2026-08-31"],
    ["31.8.26", "2026-08-31"],
    ["31,08,26", "2026-08-31"],
    ["31,08,2026", "2026-08-31"],
    ["31/08/26", "2026-08-31"],
    ["31-08-26", "2026-08-31"],
    ["1.9.2025", "2025-09-01"],
    ["09.03.26", "2026-03-09"],
  ];

  for (const [written, expected] of cases) {
    it(`reads ${written} as ${expected}`, () => {
      const found = findDate(`coffee ${written}`, TODAY);
      assert.equal(found.date, expected);
      assert.equal(found.explicit, true);
      assert.equal(found.matched, written);
    });
  }

  it("still reads an ISO date", () => {
    assert.equal(findDate("netflix on 2026-07-14", TODAY).date, "2026-07-14");
  });

  it("reads day first, not month first", () => {
    // 09.03.26 is the 9th of March, not the 3rd of September.
    assert.equal(findDate("09.03.26", TODAY).date, "2026-03-09");
  });

  it("refuses a mixed separator", () => {
    assert.equal(findDate("31.08,26", TODAY).explicit, false);
  });

  it("refuses a day that never existed", () => {
    assert.equal(findDate("31.02.26", TODAY).explicit, false);
  });

  it("refuses a month that does not exist", () => {
    assert.equal(findDate("08.13.26", TODAY).explicit, false);
  });

  it("refuses a date in the future rather than returning one", () => {
    // The mock is allowed to guess wrong. It is not allowed to produce a value
    // its own validation rejects, which turns a bad guess into a failed request.
    assert.equal(findDate("01.01.27", TODAY).explicit, false);
    assert.equal(findDate("netflix on 2027-01-01", TODAY).explicit, false);
    assert.equal(findDate("netflix on 2027-01-01", TODAY).date, TODAY);
  });

  it("does not read a grouped number as a date", () => {
    assert.equal(findDate("1,200 eur", TODAY).explicit, false);
    assert.equal(findDate("1.234,56 eur", TODAY).explicit, false);
  });

  it("still understands relative phrases", () => {
    assert.equal(findDate("spent it yesterday", TODAY).date, "2026-08-30");
    assert.equal(findDate("3 days ago", TODAY).date, "2026-08-28");
    assert.equal(findDate("the day before yesterday", TODAY).date, "2026-08-29");
  });
});

describe("a date anywhere in the sentence", () => {
  it("works at the end", async () => {
    const suggestion = await parse("lunch at kotipizza 12 eur on 30.08.26");
    assert.equal(suggestion.expenseDate, "2026-08-30");
    assert.equal(suggestion.amount, 12);
    assert.equal(suggestion.merchant, "Kotipizza");
  });

  it("works at the start", async () => {
    // Position must not matter: the date is removed wherever it is, and the
    // remaining words are read afterwards.
    const suggestion = await parse("30.08.26 lunch at kotipizza 12 eur");
    assert.equal(suggestion.expenseDate, "2026-08-30");
    assert.equal(suggestion.amount, 12);
    assert.equal(suggestion.merchant, "Kotipizza");
  });

  it("works in the middle", async () => {
    const suggestion = await parse("lunch 30.08.26 at kotipizza 12 eur");
    assert.equal(suggestion.expenseDate, "2026-08-30");
    assert.equal(suggestion.amount, 12);
    assert.equal(suggestion.merchant, "Kotipizza");
  });
});

describe("the ordering rule", () => {
  it("does not let the amount rule eat the date", async () => {
    // "31,08,26" is a well-formed grouped number (310826) and a well-formed
    // date. Running the date first, and removing it, is what decides.
    const suggestion = await parse("31,08,26 mustafa doner 20 euros");
    assert.equal(suggestion.expenseDate, "2026-08-31");
    assert.equal(suggestion.amount, 20);
  });

  it("does not let the date rule eat the amount", async () => {
    const suggestion = await parse("coffee 1,200 eur");
    assert.equal(suggestion.amount, 1200);
    assert.equal(suggestion.expenseDate, TODAY);
  });

  it("lets the merchant keep a digit once the amount is taken", async () => {
    // "7 eleven" contains a digit, which only matters if the merchant step is
    // still looking at text the amount step already claimed.
    assert.equal((await parse("spent 12 eur at 7 eleven")).merchant, "7 Eleven");
  });

  it("lets the merchant keep a currency word once the currency is taken", async () => {
    assert.equal((await parse("coffee at euro shop 4,50")).merchant, "Euro Shop");
    assert.equal((await parse("20 eur at the pound bakery")).merchant, "Pound Bakery");
  });

  it("lets the merchant keep a date word once the date is taken", async () => {
    assert.equal((await parse("paid 30 at monday market on 30.08.26")).merchant, "Monday Market");
  });
});

describe("merchants with no preposition to anchor on", () => {
  it("reads leading leftover words as the name", async () => {
    assert.equal((await parse("31,08,26 mustafa doner 20 euros")).merchant, "Mustafa Doner");
  });

  it("handles a single-letter first word", async () => {
    // "s market" failed before because the sentence had no preposition, not
    // because of the single letter — "at s market" always worked.
    assert.equal((await parse("s market chocolate 1600,789 on 31,08,26")).merchant, "S Market");
    assert.equal((await parse("spent 5 eur at s market")).merchant, "S Market");
  });

  it("does not turn a single leftover word into a shop", async () => {
    // One leftover word is far more often the thing bought than the shop.
    assert.equal((await parse("5 constructor")).merchant, null);
    assert.equal((await parse("coffee 4 eur")).merchant, null);
  });

  it("does not claim a category keyword as a shop", async () => {
    assert.equal((await parse("cinema tickets 27")).merchant, null);
    assert.equal((await parse("dentist 75 eur last week")).merchant, null);
  });
});

describe("the two reported sentences", () => {
  it("reads 's market chocolate 1600,789 on 31,08,26'", async () => {
    const suggestion = await parse("s market chocolate 1600,789 on 31,08,26");
    assert.equal(suggestion.amount, 1600.789);
    assert.equal(suggestion.merchant, "S Market");
    assert.equal(suggestion.expenseDate, "2026-08-31");
  });

  it("reads '31,08,26 mustafa doner 20 euros'", async () => {
    const suggestion = await parse("31,08,26 mustafa doner 20 euros");
    assert.equal(suggestion.amount, 20);
    assert.equal(suggestion.currency, "EUR");
    assert.equal(suggestion.merchant, "Mustafa Doner");
    assert.equal(suggestion.expenseDate, "2026-08-31");
  });
});
