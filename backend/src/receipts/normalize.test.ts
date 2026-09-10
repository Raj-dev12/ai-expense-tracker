import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deOcr, lineHasKeyword, matchesKeyword, TOTAL_WORDS } from "./ocr-text.js";
import {
  findCurrency,
  findDate,
  findItems,
  findMerchant,
  findTotal,
  findVat,
  moneyTokens,
  normalizeReceipt,
} from "./normalize.js";

/**
 * Reading a real receipt, which is nothing like reading a sentence.
 *
 * The fixtures here are written the way OCR actually hands text over: damaged
 * keywords, amounts drifting away from their descriptions, lines that merged and
 * lines that split. Every one of them is a shape a phone photo produces.
 */

const TODAY = "2026-09-10";

/** A receipt as a block of text, the way the browser will send it. */
function lines(text: string): string[] {
  return text.trim().split("\n").map((line) => line.trim());
}

describe("keywords OCR has damaged", () => {
  it("folds the characters OCR confuses back to letters", () => {
    assert.equal(deOcr("T0TAL"), "total");
    assert.equal(deOcr("TOTAI"), "totai");
    assert.equal(deOcr("YHTEENSÄ"), "yhteensa");
    assert.equal(deOcr("Total:"), "total");
  });

  for (const written of ["TOTAL", "Total", "total", "T0TAL", "TOTAI", "T0TAI", "Totai", "TOTA1", "T0TA1"]) {
    it(`reads "${written}" as the total keyword`, () => {
      assert.equal(matchesKeyword(written, TOTAL_WORDS), true);
    });
  }

  for (const written of ["YHTEENSÄ", "YHTEENSA", "Yhteensä", "YHTEENSK", "SUMMA", "Summa"]) {
    it(`reads "${written}" as the total keyword`, () => {
      assert.equal(matchesKeyword(written, TOTAL_WORDS), true);
    });
  }

  it("does not read an ordinary word as a keyword", () => {
    // The slack has to be small enough that the rest of a receipt does not
    // accidentally qualify. "Tomaatti" is a tomato, not a total.
    for (const word of ["Tomaatti", "Leipä", "Maito", "Kassa", "Tuote", "Kortti"]) {
      assert.equal(matchesKeyword(word, TOTAL_WORDS), false, word);
    }
  });

  it("finds a keyword anywhere in a line", () => {
    assert.equal(lineHasKeyword("KAIKKI YHTEENSA    24,90", TOTAL_WORDS), true);
    assert.equal(lineHasKeyword("Maito 1,29", TOTAL_WORDS), false);
  });
});

describe("amounts, written the way Europe writes them", () => {
  const cases: Array<[string, number]> = [
    ["24,90", 24.9],
    ["24.90", 24.9],
    ["2490", 2490],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["0,99", 0.99],
    ["€24,90", 24.9],
    ["24,90 €", 24.9],
    ["24,90 EUR", 24.9],
  ];

  for (const [written, expected] of cases) {
    it(`reads "${written}" as ${expected}`, () => {
      const [token] = moneyTokens(`TOTAL ${written}`);
      assert.equal(token?.value, expected);
    });
  }

  it("knows whether the cents were actually there", () => {
    // The bit that catches a lost decimal comma later on.
    assert.equal(moneyTokens("TOTAL 24,90")[0]?.hasCents, true);
    assert.equal(moneyTokens("TOTAL 2490")[0]?.hasCents, false);
  });

  it("is not fooled by a time", () => {
    assert.deepEqual(moneyTokens("Kassa 3  12:45"), moneyTokens("Kassa 3"));
  });

  it("is not fooled by a date", () => {
    assert.equal(moneyTokens("04.09.2026 14:32").length, 0);
  });

  it("leaves a VAT rate alone", () => {
    // "ALV 14% 3,06" must offer 3,06 as the tax and never 14.
    const tokens = moneyTokens("ALV 14% 3,06");
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.value, 3.06);
  });

  it("ignores a number too long to be money", () => {
    assert.equal(moneyTokens("Kuitti 000123456789").length, 0);
  });
});

describe("finding the total", () => {
  const layouts: Array<[string, number]> = [
    ["TOTAL 24,90", 24.9],
    ["Total EUR 24,90", 24.9],
    ["TOTAL              24.90", 24.9],
    ["YHTEENSÄ 24,90", 24.9],
    ["YHTEENSA          24,90 EUR", 24.9],
    ["SUMMA 24,90", 24.9],
    ["T0TAI  €24,90", 24.9],
    ["Totai 24,90", 24.9],
  ];

  for (const [line, expected] of layouts) {
    it(`reads "${line}"`, () => {
      assert.equal(findTotal([line]).total?.value, expected);
    });
  }

  it("takes the amount at the end when the line carries more than one", () => {
    // "TOTAL 3 kpl 24,90" — a count, then the money.
    assert.equal(findTotal(["TOTAL 3 kpl 24,90"]).total?.value, 24.9);
  });

  it("finds the card line separately", () => {
    const found = findTotal(lines(`
      YHTEENSÄ 24,90
      PANKKIKORTTI 24,90
    `));
    assert.equal(found.total?.value, 24.9);
    assert.equal(found.alsoPaid?.value, 24.9);
  });

  it("returns nothing rather than guessing when no line says so", () => {
    // The important one. Picking the largest number on the page would produce a
    // plausible total that looks exactly like a correct one.
    const found = findTotal(lines(`
      K-MARKET
      Maito 1,29
      Leipä 2,50
    `));
    assert.equal(found.total, null);
  });
});

describe("finding the other fields", () => {
  it("reads the VAT amount, not the rate", () => {
    assert.equal(findVat(["ALV 14,00% 3,06"])?.value, 3.06);
    assert.equal(findVat(["VAT 25,5% 5,06"])?.value, 5.06);
  });

  it("reads the shop name from the top", () => {
    assert.equal(findMerchant(lines(`
      K-MARKET RUOHOLAHTI
      Itämerenkatu 21
      Maito 1,29
    `)), "K-MARKET RUOHOLAHTI");
  });

  it("joins a name that split across lines", () => {
    // A single-letter chain initial on its own line is not a name.
    assert.equal(findMerchant(lines(`
      S
      MARKET
      Maito 1,29
    `)), "S MARKET");
  });

  it("skips the things at the top that are not names", () => {
    assert.equal(findMerchant(lines(`
      www.lidl.fi
      LIDL SUOMI
    `)), "LIDL SUOMI");
  });

  const dates: Array<[string, string]> = [
    ["04.09.2026", "2026-09-04"],
    ["4.9.2026", "2026-09-04"],
    ["04.09.26", "2026-09-04"],
    ["04/09/2026", "2026-09-04"],
    ["04-09-2026", "2026-09-04"],
    ["2026-09-04", "2026-09-04"],
    ["4. syyskuuta 2026", "2026-09-04"],
    ["4 September 2026", "2026-09-04"],
  ];

  for (const [written, expected] of dates) {
    it(`reads the date "${written}"`, () => {
      assert.equal(findDate([`Kuitti ${written} 14:32`], TODAY)?.date, expected);
    });
  }

  it("uses the most recent occurrence when the year is missing", () => {
    // "04.09." on a receipt, with today 10 September 2026.
    assert.equal(findDate(["04.09. 14:32"], TODAY)?.date, "2026-09-04");
  });

  it("refuses a date after today", () => {
    assert.equal(findDate(["04.09.2027"], TODAY), null);
  });

  it("refuses a day that never existed", () => {
    assert.equal(findDate(["31.02.2026"], TODAY), null);
  });

  it("finds the currency, and assumes euros otherwise", () => {
    assert.equal(findCurrency(["TOTAL 24,90 EUR"]), "EUR");
    assert.equal(findCurrency(["TOTAL 24.90 USD"]), "USD");
    assert.equal(findCurrency(["TOTAL 24,90"]), "EUR");
  });
});

describe("finding the things bought", () => {
  it("reads a description and an amount off each line", () => {
    const { items } = findItems(lines(`
      Maito 1,29
      Ruisleipä 2,50
    `));
    assert.deepEqual(items, [
      { description: "Maito", amount: 1.29 },
      { description: "Ruisleipä", amount: 2.5 },
    ]);
  });

  it("copes with the amount drifting away from its description", () => {
    // Which is what a receipt looks like: descriptions left, amounts right.
    const { items } = findItems(["Maito                          1,29"]);
    assert.deepEqual(items, [{ description: "Maito", amount: 1.29 }]);
  });

  it("leaves out the lines that are not things bought", () => {
    const { items } = findItems(lines(`
      Maito 1,29
      VÄLISUMMA 1,29
      YHTEENSÄ 1,29
      PANKKIKORTTI 1,29
      ALV 14% 0,16
      VAIHTORAHA 0,00
    `));
    assert.deepEqual(items.map((item) => item.amount), [1.29]);
  });

  it("notices a discount without counting it as a thing bought", () => {
    const found = findItems(lines(`
      Maito 1,29
      ALENNUS 0,30
    `));
    assert.equal(found.hadDiscountLine, true);
    assert.deepEqual(found.items.map((item) => item.amount), [1.29]);
  });

  it("does not read a bare number as a thing bought", () => {
    const { items } = findItems(["000123456", "12345 6,00"]);
    assert.equal(items.length, 0);
  });
});

describe("a receipt end to end", () => {
  const RECEIPT = `
    K-MARKET RUOHOLAHTI
    Itämerenkatu 21, Helsinki
    04.09.2026 14:32

    Maito 1L                1,29
    Ruisleipä               2,50
    Juusto 500g             6,45
    Omena 1kg               2,66

    YHTEENSÄ               12,90
    ALV 14%                 1,58
    PANKKIKORTTI           12,90
  `;

  it("reads every field", () => {
    const receipt = normalizeReceipt(lines(RECEIPT), TODAY);
    assert.equal(receipt.merchant, "K-MARKET RUOHOLAHTI");
    assert.equal(receipt.date, "2026-09-04");
    assert.equal(receipt.total, 12.9);
    assert.equal(receipt.currency, "EUR");
    assert.equal(receipt.vat, 1.58);
    assert.equal(receipt.items.length, 4);
  });

  it("says what corroborated the total", () => {
    const receipt = normalizeReceipt(lines(RECEIPT), TODAY);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("carries the text each value came from, for the photo", () => {
    const receipt = normalizeReceipt(lines(RECEIPT), TODAY);
    assert.equal(receipt.sources.total, "12,90");
    assert.equal(receipt.sources.date, "04.09.2026");
    assert.equal(receipt.sources.merchant, "K-MARKET RUOHOLAHTI");
  });

  it("returns nulls rather than guesses for a receipt it could not read", () => {
    // A photo so poor that almost nothing survived.
    const receipt = normalizeReceipt(lines(`
      ####
      ...
    `), TODAY);
    assert.equal(receipt.total, null);
    assert.equal(receipt.date, null);
    assert.equal(receipt.verdict.kind, "absent");
  });
});

describe("receipts as OCR actually hands them over", () => {
  /**
   * Two real examples, and the reason both are here.
   *
   * The first is a receipt that reads cleanly except for one damaged keyword —
   * "T0TAI" for "TOTAL" — and the arithmetic corroborates it, so it should
   * arrive ready to save.
   *
   * The second broke. "TOTAL" and its amount were on separate lines, which is
   * what a narrow receipt or an angled photo does, and the reader came back
   * saying no total was on the page at all. Writing this test is what found it.
   */

  it("reads a receipt whose total keyword is damaged", () => {
    const receipt = normalizeReceipt(
      ["K-MARKET", "10.09.2026", "Milk 1,29", "Bread 2,49", "Coffee 4,99", "T0TAI 8,77 EUR"],
      TODAY,
    );

    assert.equal(receipt.merchant, "K-MARKET");
    assert.equal(receipt.date, "2026-09-10");
    assert.equal(receipt.total, 8.77);
    assert.equal(receipt.currency, "EUR");
    assert.deepEqual(receipt.items.map((item) => item.amount), [1.29, 2.49, 4.99]);
    // 1,29 + 2,49 + 4,99 = 8,77. The damaged keyword cost nothing.
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("reads a total that wrapped onto the line below it", () => {
    const receipt = normalizeReceipt(["ALDI", "10/09/2026", "TOTAL", "24,90 €"], TODAY);

    assert.equal(receipt.merchant, "ALDI");
    assert.equal(receipt.date, "2026-09-10");
    assert.equal(receipt.total, 24.9);
    assert.equal(receipt.currency, "EUR");
    // Nothing on this receipt can confirm it — no lines, no VAT — and it says so
    // rather than presenting a bare reading as a checked one.
    assert.equal(receipt.verdict.kind, "unverified");
  });

  it("does not take the next line's amount when that line is a purchase", () => {
    // The rule that makes reading the line below safe. "Maito 1,29" under a bare
    // "YHTEENSÄ" is milk, not the total, and handing back 1,29 would be exactly
    // the plausible-and-wrong answer this module exists to refuse.
    const receipt = normalizeReceipt(["K-MARKET", "YHTEENSÄ", "Maito 1,29"], TODAY);
    assert.equal(receipt.total, null);
    assert.equal(receipt.verdict.kind, "absent");
  });

  it("does not count a wrapped total as something bought", () => {
    // Otherwise the total appears in its own sum and corroborates itself.
    const receipt = normalizeReceipt(
      ["ALDI", "Milk 1,29", "Bread 2,49", "TOTAL", "3,78"],
      TODAY,
    );
    assert.deepEqual(receipt.items.map((item) => item.amount), [1.29, 2.49]);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("reads a receipt where every line is damaged", () => {
    // 0 for O, 1 for l, 5 for S — all at once, which is what a creased thermal
    // receipt photographed in a shop doorway looks like.
    const receipt = normalizeReceipt(
      ["5-MARKET", "10.09.2026", "Mi1k 1,29", "8read 2,49", "T0TA1 3,78", "PANKKIK0RTTI 3,78"],
      TODAY,
    );
    assert.equal(receipt.total, 3.78);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("copes with the amount drifting far from its description", () => {
    const receipt = normalizeReceipt(
      [
        "PRISMA",
        "10.09.2026",
        "Kahvi Juhla Mokka 500g                          4,99",
        "Ruisleipä                                       2,49",
        "YHTEENSÄ                                        7,48",
      ],
      TODAY,
    );
    assert.equal(receipt.total, 7.48);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("reads a total stated with its currency in words", () => {
    for (const line of ["Total EUR 24,90", "TOTAL 24,90 EUR", "YHTEENSÄ €24,90", "SUMMA 24.90"]) {
      const receipt = normalizeReceipt(["KAUPPA", line], TODAY);
      assert.equal(receipt.total, 24.9, line);
    }
  });

  it("does not silently accept a merged item line", () => {
    // Two items that ran together: "Milk 1,29 Bread 2,49". Only the last amount
    // is read, so the lines add up to less than the total — and that disagreement
    // is the right outcome. Guessing which digits belonged to which product would
    // produce a sum that looks authoritative and is invented.
    const receipt = normalizeReceipt(
      ["K-MARKET", "Milk 1,29 Bread 2,49", "Coffee 4,99", "TOTAL 8,77"],
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "contradicted");
    assert.equal(receipt.total, null);
  });

  it("reads a receipt with a VAT breakdown", () => {
    const receipt = normalizeReceipt(
      [
        "RAVINTOLA LOUNAS",
        "10.09.2026 12:15",
        "Lounasbuffet                24,90",
        "YHTEENSÄ                    24,90",
        "ALV 14 %                     3,06",
        "PANKKIKORTTI                24,90",
      ],
      TODAY,
    );
    assert.equal(receipt.total, 24.9);
    assert.equal(receipt.vat, 3.06);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("survives a photo that gave up most of the page", () => {
    // Nothing invented, nothing thrown. The interface asks for what is missing.
    const receipt = normalizeReceipt(["K-M#RK€T", "|||||", "~~~~", "8,7?"], TODAY);
    assert.equal(receipt.total, null);
    assert.equal(receipt.verdict.kind, "absent");
  });

  it("keeps the text each value came from, so the photo can be marked", () => {
    const receipt = normalizeReceipt(
      ["K-MARKET", "10.09.2026", "Milk 1,29", "T0TAI 1,29"],
      TODAY,
    );
    assert.equal(receipt.sources.total, "1,29");
    assert.equal(receipt.sources.date, "10.09.2026");
    assert.equal(receipt.sources.merchant, "K-MARKET");
  });
});

describe("OCR debris around the shop name", () => {
  /**
   * The top of a receipt is the worst part of the page to read: a logo, a
   * border, a torn edge, a barcode. None of it is text and OCR reports it as
   * text anyway, which arrived as stray symbols wrapped around an otherwise
   * correct name.
   */
  const noisy: Array<[string, string]> = [
    ["*** K-MARKET ***", "K-MARKET"],
    ["|| LIDL SUOMI ||", "LIDL SUOMI"],
    ["~ PRISMA ~", "PRISMA"],
    ["  .:K-MARKET RUOHOLAHTI:.  ", "K-MARKET RUOHOLAHTI"],
    ["=== ALEPA ===", "ALEPA"],
    ["_ S-MARKET _", "S-MARKET"],
    ["»«PRISMA»«", "PRISMA"],
  ];

  for (const [written, expected] of noisy) {
    it(`cleans ${JSON.stringify(written)}`, () => {
      assert.equal(findMerchant([written, "Maito 1,29"]), expected);
    });
  }

  it("keeps the marks that belong inside a name", () => {
    // The important half. "K-MARKET" flattened to "KMARKET" would look correct
    // and be wrong, which is worse than a stray character somebody can see and
    // delete. So the ends are trimmed and the middle is left alone.
    assert.equal(findMerchant(["K-MARKET", "Maito 1,29"]), "K-MARKET");
    assert.equal(findMerchant(["#H&M#", "Paita 19,99"]), "H&M");
    assert.equal(findMerchant(["-- Fafa's --", "Pita 9,90"]), "Fafa's");
    assert.equal(findMerchant(["ST. LAURENT", "Takki 99,00"]), "ST. LAURENT");
  });

  it("gives up rather than returning punctuation", () => {
    // A line that is nothing but border marks is not a name with noise on it.
    assert.equal(findMerchant(["*****", "|||||", "Maito 1,29"]), null);
  });
});

/**
 * Finnish joins words together, and a receipt is full of the results.
 *
 * Whole-word comparison misses every compound: `korttimaksu` is five edits from
 * `kortti`, well past any slack a keyword gets. That is not a spelling problem to
 * be listed around — `kaikkiyhteensa` had already been added to `TOTAL_WORDS` by
 * hand, which is the whitelist this codebase keeps warning about — so the rule
 * looks inside the word instead.
 */
describe("compound keywords", () => {
  it("reads KORTTIMAKSU as the card line, not as a purchase", () => {
    // Both failures this caused, in one receipt. Unrecognised as a payment line,
    // the total lost its free second reading; unrecognised as a non-item, the
    // card line was counted as a 13,62 purchase, which pushed the item sum past
    // the total and made a corroborating line into a contradicting one.
    const receipt = normalizeReceipt(
      ["LIDL", "Salaatti 1,99", "Avokado 2,49", "YHTEENSÄ 4,48", "KORTTIMAKSU 4,48"],
      TODAY,
    );

    assert.equal(receipt.items.length, 2);
    assert.ok(
      !receipt.items.some((item) => /kortti/i.test(item.description ?? "")),
      "the card line must not be counted among the things bought",
    );
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("reads KAIKKIYHTEENSÄ as a total without it being listed", () => {
    // The entry that used to be hand-added is gone from TOTAL_WORDS, and this
    // still passes — which is the point of removing it.
    const receipt = normalizeReceipt(["KAUPPA", "Maito 1,29", "KAIKKIYHTEENSÄ 1,29"], TODAY);
    assert.equal(receipt.total, 1.29);
  });

  it("does not go looking for short keywords inside other words", () => {
    // "sum", "net", "vat" and "card" appear inside ordinary words, so the
    // compound rule starts at five characters. A product whose name contains one
    // of them is still a product.
    const receipt = normalizeReceipt(["KAUPPA", "Vatkain 9,90", "YHTEENSÄ 9,90"], TODAY);
    assert.equal(receipt.items.length, 1);
    assert.equal(receipt.total, 9.9);
  });
});

/**
 * The quantity line a receipt prints under a multi-buy item.
 *
 * "3 x 0,45" explains the line above it — three at forty-five cents — and its
 * money is already counted there. Adding it as a purchase counts it twice, which
 * pushed a real Lidl receipt's item sum to 14,44 against a correct total of
 * 13,62. A sum *exceeding* the total is treated as strong evidence the total is
 * too small, so the double count was being fed into the check that trusts it
 * most, and a correct total was blanked.
 */
describe("multi-buy quantity lines", () => {
  it("does not count the unit-price line as something bought", () => {
    const receipt = normalizeReceipt(
      ["LIDL", "Ruispala 100 % 1,35", "3 x 0,45 EUR", "Avokado 700g 2,49", "YHTEENSÄ 3,84"],
      TODAY,
    );
    assert.equal(receipt.items.length, 2);
    assert.equal(receipt.verdict.kind, "corroborated");
    assert.equal(receipt.total, 3.84);
  });

  it("survives the damage OCR does to that line", () => {
    // Every one of these came off a real photograph of the same receipt.
    for (const line of ["3 x 0,45 EUR", "3 x 0,45 — EUR", "3 x 0,45. EUR |", "3 x 0,45 EWR", "9 x 0,45. EUR"]) {
      const receipt = normalizeReceipt(["LIDL", "Ruispala 1,35", line, "YHTEENSÄ 1,35"], TODAY);
      assert.equal(receipt.items.length, 1, line);
      assert.equal(receipt.total, 1.35, line);
    }
  });

  it("leaves an item that states its own quantity inline alone", () => {
    // "Omena 3 x 0,45 1,35" begins with the product and ends with the real
    // amount. Only a line that *starts* with the quantity is a breakdown.
    const receipt = normalizeReceipt(["KAUPPA", "Omena 3 x 0,45 1,35", "YHTEENSÄ 1,35"], TODAY);
    assert.equal(receipt.items.length, 1);
    assert.equal(receipt.verdict.kind, "corroborated");
  });

  it("does not treat the excluded line as a missing amount", () => {
    // Its money is not absent from the sum, it is already in the line above.
    // Counting it as unaccounted would weaken the items check on exactly the
    // receipts where it is working — so a wrong total here must still be caught.
    const receipt = normalizeReceipt(
      ["LIDL", "Ruispala 100 % 1,35", "3 x 0,45 EUR", "Avokado 700g 2,49", "YHTEENSÄ 9,99"],
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "contradicted");
    assert.equal(receipt.total, null);
  });
});
