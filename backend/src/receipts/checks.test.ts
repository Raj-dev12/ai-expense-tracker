import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeReceipt } from "./normalize.js";
import type { TotalVerdict } from "./types.js";

/**
 * Catching a total that is wrong but looks right.
 *
 * The tests that matter here are not the ones where OCR failed visibly. They are
 * the ones where it succeeded, confidently, at reading the wrong number: 24,90
 * arriving as 2490 or as 4,90. Both are plausible amounts. Both would be filled
 * into the confirm step and approved at a glance.
 *
 * Every fixture below is a receipt whose lines are correct and whose total has
 * been damaged, so the only thing that can catch the damage is the arithmetic.
 */

const TODAY = "2026-09-10";

function lines(text: string): string[] {
  return text.trim().split("\n").map((line) => line.trim());
}

/** A receipt whose lines add up to 24,90, with the total line left to the caller. */
function receiptWithTotal(totalLine: string, extra = ""): TotalVerdict {
  return normalizeReceipt(
    lines(`
      K-MARKET
      04.09.2026

      Maito                   1,29
      Ruisleipä               2,50
      Juusto                  6,45
      Pesuaine               14,66

      ${totalLine}
      ${extra}
    `),
    TODAY,
  ).verdict;
}

describe("a total the lines disagree with", () => {
  it("catches a lost decimal comma", () => {
    // The commonest money error OCR makes: 24,90 read as 2490.
    const verdict = receiptWithTotal("YHTEENSÄ              2490");
    assert.equal(verdict.kind, "contradicted");
    assert.equal(verdict.kind === "contradicted" && verdict.read, 2490);
  });

  it("says what the total should have been", () => {
    // Knowing a number is wrong is useful; knowing the right one is far better,
    // and dividing by a hundred makes the lines add up, which is close to proof.
    const verdict = receiptWithTotal("YHTEENSÄ              2490");
    assert.equal(verdict.kind === "contradicted" && verdict.suggested, 24.9);
  });

  it("names the lost comma when the total has no cents", () => {
    const verdict = receiptWithTotal("YHTEENSÄ              2490");
    assert.match(
      verdict.kind === "contradicted" ? verdict.problem : "",
      /lost decimal comma/,
    );
  });

  it("catches a dropped leading digit", () => {
    // 24,90 read as 4,90. No arithmetic recovers it by rescaling, but the lines
    // still say what the answer was.
    const verdict = receiptWithTotal("YHTEENSÄ               4,90");
    assert.equal(verdict.kind, "contradicted");
    assert.equal(verdict.kind === "contradicted" && verdict.read, 4.9);
    assert.equal(verdict.kind === "contradicted" && verdict.suggested, 24.9);
  });

  it("catches a single misread digit", () => {
    // 24,90 read as 21,90 — an 8-for-3 class of error, entirely plausible, and
    // invisible to any confidence score the OCR engine could report.
    const verdict = receiptWithTotal("YHTEENSÄ              21,90");
    assert.equal(verdict.kind, "contradicted");
    assert.equal(verdict.kind === "contradicted" && verdict.suggested, 24.9);
  });

  it("accepts the total when the lines agree", () => {
    const verdict = receiptWithTotal("YHTEENSÄ              24,90");
    assert.equal(verdict.kind, "corroborated");
    assert.equal(verdict.kind === "corroborated" && verdict.total, 24.9);
  });

  it("allows a couple of cents of rounding", () => {
    const verdict = receiptWithTotal("YHTEENSÄ              24,91");
    assert.equal(verdict.kind, "corroborated");
  });

  it("does not cry wolf over a discounted receipt", () => {
    // Lines adding up to more than the total is what a discount looks like, and
    // OCR rarely preserves the minus sign well enough to add it in. When the
    // receipt showed a discount, this declines to have an opinion.
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        Ruisleipä               2,50
        ALENNUS                 0,50
        YHTEENSÄ                3,29
      `),
      TODAY,
    ).verdict;
    assert.notEqual(verdict.kind, "contradicted");
  });

  it("still objects when the total exceeds the lines, discount or not", () => {
    // A discount can only make the total smaller. Money in the total that
    // nothing on the receipt accounts for is wrong either way.
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        ALENNUS                 0,50
        YHTEENSÄ               99,00
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "contradicted");
  });
});

describe("a total the VAT line disagrees with", () => {
  /** One item, so the VAT line is the only thing that can check the total. */
  function withVat(totalLine: string, vatLine: string): TotalVerdict {
    return normalizeReceipt(
      lines(`
        RAVINTOLA
        04.09.2026
        Lounas                 24,90
        ${totalLine}
        ${vatLine}
      `),
      TODAY,
    ).verdict;
  }

  it("accepts VAT that is a known rate of the total", () => {
    // 14% on food: 24,90 x 14/114 = 3,06.
    assert.equal(withVat("YHTEENSÄ 24,90", "ALV 14% 3,06").kind, "corroborated");
  });

  it("accepts the standard rate too", () => {
    // 25.5%: 24,90 x 25.5/125.5 = 5,06.
    assert.equal(withVat("YHTEENSÄ 24,90", "ALV 25,5% 5,06").kind, "corroborated");
  });

  it("catches a hundredfold error through the VAT alone", () => {
    // The line item is damaged the same way, so the sum agrees with the wrong
    // total and only the VAT figure is left to notice. It fails every rate at
    // once, which is what makes the check worth having on its own.
    const verdict = normalizeReceipt(
      lines(`
        RAVINTOLA
        Lounas                  2490
        YHTEENSÄ                2490
        ALV 14%                 3,06
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "contradicted");
    assert.match(verdict.kind === "contradicted" ? verdict.problem : "", /VAT/);
  });

  it("recovers the right total from the VAT when the lines cannot", () => {
    const verdict = normalizeReceipt(
      lines(`
        RAVINTOLA
        YHTEENSÄ                2490
        ALV 14%                 3,06
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind === "contradicted" && verdict.suggested, 24.9);
  });
});

describe("a total the card line disagrees with", () => {
  it("accepts a card line that repeats the total", () => {
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        YHTEENSÄ               24,90
        PANKKIKORTTI           24,90
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "corroborated");
  });

  it("objects when the two readings differ", () => {
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        YHTEENSÄ               24,90
        PANKKIKORTTI           2490
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "contradicted");
  });
});

describe("a total nothing can check", () => {
  it("is reported as unverified rather than as confirmed", () => {
    // The distinction this design turns on. "We read a number" is not "we
    // checked a number", and showing them the same way presents the first as
    // the second.
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        04.09.2026
        YHTEENSÄ               24,90
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "unverified");
    assert.equal(verdict.kind === "unverified" && verdict.total, 24.9);
    assert.match(verdict.kind === "unverified" ? verdict.why : "", /Nothing else on this receipt/);
  });

  it("says so when the amount is also unusually large", () => {
    const verdict = normalizeReceipt(
      lines(`
        KAUPPA
        YHTEENSÄ            9 000,00
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "unverified");
    assert.match(verdict.kind === "unverified" ? verdict.why : "", /unusually large/);
  });

  it("never rejects a total for being large on its own", () => {
    // Size is a soft signal. A five thousand euro receipt is unusual, not
    // impossible, and refusing one would be the parser overruling the evidence.
    const verdict = normalizeReceipt(
      lines(`
        KAUPPA
        Sohva               9 000,00
        YHTEENSÄ            9 000,00
      `),
      TODAY,
    ).verdict;
    assert.notEqual(verdict.kind, "contradicted");
  });
});

describe("no total at all", () => {
  it("says so rather than picking the largest number on the page", () => {
    const verdict = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        Ruisleipä               2,50
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "absent");
    assert.match(verdict.kind === "absent" ? verdict.why : "", /No line on this receipt/);
  });
});

describe("what reaches the confirm step", () => {
  it("carries no total at all when the reading is contradicted", () => {
    // The value that was read stays inside the verdict, where nothing can
    // mistake it for a figure ready to be saved. An empty box cannot be
    // approved at a glance; a populated one with a red tint can.
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        YHTEENSÄ                2490
      `),
      TODAY,
    );
    assert.equal(receipt.total, null);
    assert.equal(receipt.verdict.kind, "contradicted");
  });

  it("carries the total when it was checked", () => {
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        YHTEENSÄ                1,29
      `),
      TODAY,
    );
    assert.equal(receipt.total, 1.29);
  });
});
