import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDate } from "./extract.js";
import { MONTH_NAME_COUNT, monthFromName } from "./month-names.js";
import { mockParser } from "./mock.js";

const TODAY = "2026-08-31";

async function parse(sentence: string) {
  const { suggestion } = await mockParser.parseExpense({ sentence, today: TODAY });
  return suggestion;
}

/**
 * Helpers that say which of the three outcomes came back.
 *
 * Written as helpers rather than inline so that a test reads as the claim it is
 * making. "This is a found date and it is the 4th of September" and "this is a
 * date the parser could not read" are different assertions, and the shape of the
 * result is the thing that distinguishes them.
 */
function dateOf(text: string, today = TODAY): string | null {
  const found = findDate(text, today);
  return found.kind === "found" ? found.date : null;
}

function problemOf(text: string, today = TODAY): string | null {
  const found = findDate(text, today);
  return found.kind === "unreadable" ? found.problem : null;
}

function kindOf(text: string, today = TODAY): string {
  return findDate(text, today).kind;
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
      assert.equal(found.kind, "found");
      assert.equal(dateOf(`coffee ${written}`), expected);
      assert.equal(found.kind === "found" ? found.matched : null, written);
    });
  }

  it("still reads an ISO date", () => {
    assert.equal(dateOf("netflix on 2026-07-14"), "2026-07-14");
  });

  it("reads day first, not month first", () => {
    // 09.03.26 is the 9th of March, not the 3rd of September.
    assert.equal(dateOf("09.03.26"), "2026-03-09");
  });

  it("refuses a mixed separator", () => {
    assert.equal(kindOf("31.08,26"), "none");
  });

  it("does not read a grouped number as a date", () => {
    assert.equal(kindOf("1,200 eur"), "none");
    assert.equal(kindOf("1.234,56 eur"), "none");
  });

  it("still understands relative phrases", () => {
    assert.equal(dateOf("spent it yesterday"), "2026-08-30");
    assert.equal(dateOf("3 days ago"), "2026-08-28");
    assert.equal(dateOf("the day before yesterday"), "2026-08-29");
  });
});

describe("month names, English and Finnish", () => {
  // The bug this was written for: "sept 4" was not recognised at all, and the
  // parser silently used today instead.
  //
  // Today is 31 August 2026 throughout, which is why every September date with
  // no year in it lands in 2025: September 2026 has not happened yet. That is
  // the year rule doing its job, and it is asserted directly further down.
  const cases: Array<[string, string]> = [
    // Month first.
    ["sept 4", "2025-09-04"],
    ["sep 4", "2025-09-04"],
    ["september 4", "2025-09-04"],
    ["September 4th", "2025-09-04"],
    ["Sept. 4", "2025-09-04"],
    ["Sep 4, 2025", "2025-09-04"],
    ["august 3", "2026-08-03"],
    ["Aug 3rd 2026", "2026-08-03"],
    // Day first.
    ["4 sept", "2025-09-04"],
    ["4 september", "2025-09-04"],
    ["4th September", "2025-09-04"],
    ["4 September 2025", "2025-09-04"],
    ["1st august 2026", "2026-08-01"],
    ["21st august", "2026-08-21"],
    ["22nd august", "2026-08-22"],
    ["23rd august", "2026-08-23"],
    // Finnish, in the forms a date actually takes.
    ["4. syyskuuta", "2025-09-04"],
    ["4 syyskuuta 2025", "2025-09-04"],
    ["4. syys", "2025-09-04"],
    ["syyskuun 4.", "2025-09-04"],
    ["4. elokuuta", "2026-08-04"],
    ["4. elokuuta 2026", "2026-08-04"],
    ["1. tammikuuta 2026", "2026-01-01"],
    ["15. joulukuuta 2025", "2025-12-15"],
    ["3. kesäkuuta", "2026-06-03"],
    // Written without the umlaut, which is what a phone keyboard set to English
    // gives you.
    ["3. kesakuuta", "2026-06-03"],
    ["10. heinakuuta", "2026-07-10"],
  ];

  for (const [written, expected] of cases) {
    it(`reads "${written}" as ${expected}`, () => {
      assert.equal(dateOf(`53 euros for clothes at uniqlo on ${written}`), expected);
    });
  }

  it("reads the sentence from the bug report", async () => {
    // Typed on 4 September or later, this is 2026. Typed here on 31 August, the
    // most recent 4 September is last year's — see the year rule below.
    const { suggestion: inOctober } = await mockParser.parseExpense({
      sentence: "53 euros for clothes at uniqlo on sept 4",
      today: "2026-10-15",
    });
    assert.equal(inOctober.expenseDate, "2026-09-04");
    assert.equal(inOctober.dateNote, null);

    const suggestion = await parse("53 euros for clothes at uniqlo on sept 4");
    assert.equal(suggestion.expenseDate, "2025-09-04");
    assert.equal(suggestion.dateNote, null);
    assert.equal(suggestion.amount, 53);
    assert.equal(suggestion.merchant, "Uniqlo");
  });

  it("does not read November as March", () => {
    // `mar` is March and `marras` is November. A shorter alternative matched
    // first would read the first three letters of "marras" and be seven months
    // wrong, which is why the alternation is sorted longest name first.
    assert.equal(dateOf("4. marraskuuta 2025"), "2025-11-04");
    assert.equal(dateOf("4 marras 2025"), "2025-11-04");
    assert.equal(dateOf("4 march 2026"), "2026-03-04");
    assert.equal(dateOf("4 mar 2026"), "2026-03-04");
  });

  it("removes the preposition along with the date", () => {
    // Left behind, "on" is a word the merchant step anchors names to, and the
    // sentence would have looked to it like a shop called "4".
    const found = findDate("53 euros at uniqlo on sept 4", TODAY);
    assert.equal(found.kind === "found" ? found.matched : null, "on sept 4");
  });

  it("covers twelve months in both languages", () => {
    // Twelve English names plus abbreviations, and twelve Finnish stems with
    // their date endings. A count rather than a list, so the check fails if a
    // month is ever dropped from the table.
    assert.ok(MONTH_NAME_COUNT >= 24 + 12 * 5);
    for (let month = 1; month <= 12; month += 1) {
      const english = ["january", "february", "march", "april", "may", "june", "july",
        "august", "september", "october", "november", "december"][month - 1]!;
      const finnish = ["tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta", "toukokuuta",
        "kesäkuuta", "heinäkuuta", "elokuuta", "syyskuuta", "lokakuuta", "marraskuuta",
        "joulukuuta"][month - 1]!;
      assert.equal(monthFromName(english), month, english);
      assert.equal(monthFromName(finnish), month, finnish);
    }
  });
});

describe("a day and month with no year", () => {
  /**
   * The rule: the most recent occurrence on or before today.
   *
   * Somebody writing an expense is recording something already spent, so the
   * reading that puts the date in the past is the one they meant — and the other
   * reading produces a date the rest of the app refuses anyway.
   */
  it("uses this year when the month has already happened", () => {
    // Today is 31 August 2026.
    assert.equal(dateOf("3 august"), "2026-08-03");
    assert.equal(dateOf("1 january"), "2026-01-01");
  });

  it("uses last year when the month is still ahead", () => {
    // "sept 4" typed in August means last September, not next.
    assert.equal(dateOf("sept 4"), "2025-09-04");
    assert.equal(dateOf("25 december"), "2025-12-25");
  });

  it("uses this year for the same words typed a month later", () => {
    // The example from the bug report: typed in October, "sept 4" is this year.
    assert.equal(dateOf("sept 4", "2026-10-15"), "2026-09-04");
  });

  it("today itself counts as on or before today", () => {
    assert.equal(dateOf("31 august"), "2026-08-31");
  });

  it("walks back to the most recent leap year for 29 February", () => {
    // 2026 is not a leap year and neither is 2025; 2024 is.
    assert.equal(dateOf("29 february"), "2024-02-29");
  });
});

describe("a date that was clearly meant and could not be read", () => {
  /**
   * The behaviour this whole change is about.
   *
   * Falling back to today produces a wrong date that looks exactly as deliberate
   * as a right one, and the confirm step shows both the same way. So anything
   * that was plainly an attempt at a date says so instead.
   */
  it("reports an impossible day rather than using today", () => {
    assert.equal(kindOf("31 february"), "unreadable");
    assert.ok(problemOf("31 february")?.includes("not a real date"));
    assert.equal(dateOf("31 february"), null);
  });

  it("reports an impossible numeric date", () => {
    assert.equal(kindOf("31.02.26"), "unreadable");
    assert.ok(problemOf("31.02.26")?.includes("not a real date"));
  });

  it("reports a date in the future rather than using today", () => {
    assert.equal(kindOf("01.01.27"), "unreadable");
    assert.ok(problemOf("01.01.27")?.includes("in the future"));
    assert.equal(kindOf("netflix on 2027-01-01"), "unreadable");
    assert.equal(kindOf("4 september 2027"), "unreadable");
    // A year that is written down is taken at its word, not slid backwards to
    // the nearest reading that would work. "4 September 2026" on 31 August is
    // next week, and saying so is more useful than silently meaning 2025.
    assert.equal(kindOf("4 september 2026"), "unreadable");
    assert.ok(problemOf("4 september 2026")?.includes("in the future"));
  });

  it("reports a month named with no day", () => {
    assert.equal(kindOf("53 euros for clothes at uniqlo in september"), "unreadable");
    assert.ok(problemOf("in september")?.includes("names a month but not a day"));
    assert.equal(kindOf("ostin vaatteita syyskuussa"), "unreadable");
  });

  it("quotes the date alone, without the preposition", () => {
    // The match includes "on" so that it is removed with the date; the message
    // must not, because "on" is not the part the person got wrong.
    assert.equal(problemOf("53 euros at uniqlo on 31 february"), "“31 february” is not a real date.");
  });

  it("quotes the text it failed on", () => {
    // The person is about to look back at their own sentence, so a generic
    // message would leave them hunting for which part was the problem.
    assert.ok(problemOf("31 february")?.includes("31 february"));
    assert.ok(problemOf("netflix on 2027-01-01")?.includes("2027-01-01"));
  });

  it("leaves an out-of-range numeric triple alone", () => {
    // "45,99,26" is not a misspelt date, it is a grouped number, and claiming
    // otherwise would refuse an amount somebody typed correctly. Only a triple
    // that is date-shaped and fails on the calendar is worth reporting.
    assert.equal(kindOf("45,99,26"), "none");
    assert.equal(kindOf("08.13.26"), "none");
  });

  it("does not treat the word may as a failed date", () => {
    // "may" is a common English verb and would otherwise turn every sentence
    // containing it into a date the parser refused to guess at.
    assert.equal(kindOf("i may have spent too much at prisma"), "none");
    // It still works when a day number sits beside it, which is the evidence
    // that was missing.
    assert.equal(dateOf("4 may"), "2026-05-04");
    assert.equal(dateOf("may 4"), "2026-05-04");
  });

  it("says nothing at all when the sentence has no date in it", () => {
    // The ordinary case, and the one that must stay quiet: today is right here.
    assert.equal(kindOf("42 euros at lidl"), "none");
    assert.equal(kindOf("coffee 3.50"), "none");
  });
});

describe("what the parser hands the confirm step", () => {
  it("fills in today when no date was mentioned", async () => {
    const suggestion = await parse("42 euros at lidl");
    assert.equal(suggestion.expenseDate, TODAY);
    assert.equal(suggestion.dateNote, null);
  });

  it("leaves the date empty when one was meant and could not be read", async () => {
    const suggestion = await parse("53 euros at uniqlo on 31 february");
    assert.equal(suggestion.expenseDate, null);
    assert.ok(suggestion.dateNote?.includes("not a real date"));
    // The rest of the sentence is still read. The date failing does not throw
    // away the work, it just refuses to guess at the one part it could not do.
    assert.equal(suggestion.amount, 53);
    assert.equal(suggestion.merchant, "Uniqlo");
  });

  it("is less confident about a sentence whose date it could not read", async () => {
    const readable = await mockParser.parseExpense({
      sentence: "53 euros at uniqlo on 4 september",
      today: TODAY,
    });
    const silent = await mockParser.parseExpense({
      sentence: "53 euros at uniqlo",
      today: TODAY,
    });
    const broken = await mockParser.parseExpense({
      sentence: "53 euros at uniqlo on 31 february",
      today: TODAY,
    });

    assert.ok(readable.confidence > silent.confidence);
    // Something was said and not understood, which is worse than nothing being
    // said at all.
    assert.ok(broken.confidence < silent.confidence);
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

describe("a name with nothing marking it", () => {
  /**
   * The reported bug, and the shape behind it.
   *
   * The merchant step used to require one of a few phrasings — a preposition in
   * front, two words at the start, a capital letter. That is a whitelist of the
   * ways a name can appear, and a whitelist of phrasings can always be walked
   * around. "32 euro netflix sept 5" has a shop name sitting between the amount
   * and the date with nothing marking it at all.
   *
   * What replaced it is the opposite question: the amount, the currency and the
   * date have been removed, and the words that say what was *bought* are known,
   * so whatever survives is the name.
   */
  it("finds a name between the amount and the date", async () => {
    const suggestion = await parse("32 euro netflix sept 5");
    assert.equal(suggestion.merchant, "Netflix");
    assert.equal(suggestion.amount, 32);
    assert.equal(suggestion.currency, "EUR");
    assert.equal(suggestion.category, "Entertainment");
    // 2025, because today here is 31 August 2026 and September has not happened
    // yet. Typed in October it is this year — see the year rule above.
    assert.equal(suggestion.expenseDate, "2025-09-05");
  });

  it("finds it wherever in the sentence it sits", async () => {
    for (const sentence of [
      "32 euro netflix sept 5",
      "netflix 32 euro",
      "sept 5 netflix 32 euro",
      "32 euro netflix",
    ]) {
      assert.equal((await parse(sentence)).merchant, "Netflix", sentence);
    }
  });

  it("does not need the capital letter it used to fall back on", async () => {
    assert.equal((await parse("12,99 spotify")).merchant, "Spotify");
    assert.equal((await parse("12,99 Spotify")).merchant, "Spotify");
  });

  it("takes a capitalised word it has never heard of", async () => {
    // No preposition, one word, not a brand. The capital is the only signal, and
    // it is now enough on its own — it used to be ignored when the word was the
    // first one left over.
    assert.equal((await parse("20 euro Kotipizza")).merchant, "Kotipizza");
    assert.equal((await parse("15 eur Fafa's")).merchant, "Fafa's");
  });

  it("stops at the brand rather than running past it", async () => {
    // A brand is a complete name by itself, so what follows it is what was
    // bought there rather than more of the name.
    assert.equal((await parse("89 eur ikea shelves")).merchant, "Ikea");
    assert.equal((await parse("35 eur uber to the airport")).merchant, "Uber");
  });
});

describe("splitting what is left into a name and a description", () => {
  /**
   * Two shapes, and the rule that separates them.
   *
   * A preposition, when there is one, is the boundary: before it is what was
   * bought, after it is where. With no preposition the leading run is the name,
   * up to two words, stopping at any word that says what was bought.
   */
  it("splits on the preposition when there is one", async () => {
    // "coffee and tea" is what was bought; "k market" is where.
    const suggestion = await parse("coffee and tea at k market 14,6");
    assert.equal(suggestion.merchant, "K Market");
    assert.equal(suggestion.category, "Restaurants");
  });

  it("takes the leading run when there is no preposition", async () => {
    // "chocolate" is past the two-word cap and stays out of the name.
    assert.equal((await parse("s market chocolate 1600,789 on 31,08,26")).merchant, "S Market");
    assert.equal((await parse("31,08,26 mustafa doner 20 euros")).merchant, "Mustafa Doner");
  });

  it("refuses to promote a thing to a name", async () => {
    // The whole leftover is a common noun. These are things you buy, not places.
    assert.equal((await parse("coffee 4 eur")).merchant, null);
    assert.equal((await parse("cinema tickets 27")).merchant, null);
    assert.equal((await parse("dentist 75 eur last week")).merchant, null);
    assert.equal((await parse("20 eur groceries")).merchant, null);
  });

  it("refuses a capitalised thing as well", async () => {
    // This used to be handled by ignoring the first word, which was a rule about
    // position. Asking whether the word names a thing is the better question and
    // gives the same answer here for a reason that survives rephrasing.
    assert.equal((await parse("Coffee 4 eur")).merchant, null);
    assert.equal((await parse("Dentist 75 eur")).merchant, null);
  });

  it("keeps a name whose first word also names a category", async () => {
    // A preposition is stronger evidence than the word list, so "cafe regatta"
    // stays a shop even though "cafe" is a category keyword.
    assert.equal((await parse("paid 12 eur at cafe regatta on monday")).merchant, "Cafe Regatta");
    assert.equal((await parse("9 eur at the coffee house")).merchant, "Coffee House");
  });

  it("leaves a lone unknown lowercase word alone", async () => {
    // Genuinely ambiguous: "5 constructor" has the identical shape to
    // "5 chocolate", and nothing in the sentence says which is a shop. Guessing
    // here would produce a merchant that looks as deliberate as a correct one,
    // which is the failure this project keeps having. The confirm step is where
    // a person settles it.
    assert.equal((await parse("5 constructor")).merchant, null);
    assert.equal((await parse("4 eur pastry")).merchant, null);
  });

  it("keeps the whole sentence as the description either way", async () => {
    // The split decides what is promoted to a name. Nothing is thrown away:
    // description holds the sentence exactly as it was typed, which is why the
    // leftover words need no destination of their own.
    assert.equal(
      (await parse("coffee and tea at k market 14,6")).description,
      "coffee and tea at k market 14,6",
    );
    assert.equal((await parse("32 euro netflix sept 5")).description, "32 euro netflix sept 5");
  });
});

describe("brands and things are different kinds of word", () => {
  /**
   * The conflation that caused the bug. "coffee" and "netflix" are both evidence
   * of a category, but one says what was bought and the other says what was
   * bought *and where*. One list could only refuse both.
   */
  it("a brand names the category and the shop", async () => {
    const suggestion = await parse("32 euro netflix");
    assert.equal(suggestion.category, "Entertainment");
    assert.equal(suggestion.merchant, "Netflix");
  });

  it("a common noun names the category only", async () => {
    const suggestion = await parse("32 euro cinema");
    assert.equal(suggestion.category, "Entertainment");
    assert.equal(suggestion.merchant, null);
  });

  it("both still find the category from the whole sentence", async () => {
    assert.equal((await parse("12 eur at lidl")).category, "Groceries");
    assert.equal((await parse("12 eur of milk at the corner shop")).category, "Groceries");
  });
});
