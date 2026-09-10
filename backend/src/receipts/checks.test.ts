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
        PANKKIKORTTI           29,40
      `),
      TODAY,
    ).verdict;
    assert.equal(verdict.kind, "contradicted");
  });

  it("ignores a card line whose own reading lost its cents", () => {
    // This used to be the case above, with the card line reading 2490, and it
    // asserted `contradicted` — which threw away a total of 24,90 that had been
    // read perfectly, because the *card* line was the damaged one.
    //
    // A card charge is always printed with cents, so a bare integer there is not
    // a reading of the amount: it is debris. Measured on real receipts, every
    // misparse of this line was one — 3, 4, 7, 1988 — while the printed value had
    // cents and was sitting on the same line. Ignoring it costs a corroboration
    // that was never real. Trusting it destroys a total that was.
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        YHTEENSÄ               24,90
        PANKKIKORTTI           2490
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "unverified");
    assert.equal(receipt.total, 24.9);
  });

  it("takes the amount with cents, not the last number on the line", () => {
    // "Korttimaksu < 3" is a real line off a real receipt: the printed 13,62 was
    // destroyed and a stray 3 survived. The same shape arrives as trailing debris
    // — a VAT class letter read as a digit after the amount — and `lastAmount`
    // takes the last token, so the debris would win precisely because it comes
    // last.
    const receipt = normalizeReceipt(
      lines(`
        LIDL
        Salaatti                1,99
        Avokado                 2,49
        YHTEENSÄ                4,48
        Korttimaksu             4,48 8
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "corroborated");
    assert.equal(receipt.total, 4.48);
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

/**
 * Not every check is worth the same, and treating them as if they were threw
 * away correct answers.
 *
 * Measured on ten real receipts: five totals read exactly right, and every one of
 * them contradicted, because the item sums were short by a euro or two. Item
 * prices are small dense text and the total is one large isolated line — the sum
 * is right only if all of many things read, the total only if one thing did. So
 * the sum disagreeing is the *likeliest* outcome on a receipt whose total is
 * perfect, and it was being allowed to overrule a card line that agreed exactly.
 */
describe("checks that are not equally reliable", () => {
  it("believes the card line over a short item sum", () => {
    // The measured case, from a real Lidl receipt: YHTEENSÄ and Korttimaksu both
    // read 13,62 and agree with each other, while one item price was mangled so
    // the lines add up short. Two independent readings of the same number is the
    // strongest evidence on the page; the sum being short says a price was
    // misread, which is a fact about the items, not about the total.
    const receipt = normalizeReceipt(
      lines(`
        LIDL
        Salaatti                1,99
        Ruispala                1,35
        Kastike                 3,79
        Savutofu                1,75
        Avokado                 2,49
        YHTEENSÄ               13,62
        KORTTIMAKSU            13,62
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "corroborated");
    assert.equal(receipt.total, 13.62);
  });

  it("still contradicts when the card line is the thing that disagrees", () => {
    // The other half of the same rule. One line disagreeing with another line is
    // a real conflict, because both read about as well as each other.
    const receipt = normalizeReceipt(
      lines(`
        LIDL
        Salaatti                1,99
        YHTEENSÄ               18,62
        KORTTIMAKSU            13,62
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "contradicted");
    assert.equal(receipt.total, null);
  });

  it("reports a shortfall the receipt itself explains, rather than blanking the total", () => {
    // "Pesuaine 1466" is 14,66 with the comma eaten — an amount the receipt
    // printed and `findItems` refused, because a price without cents is not a
    // price. The lines are therefore short *by construction*, and a sum missing a
    // known amount cannot argue about the total.
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        Ruisleipä               2,50
        Juusto                  6,45
        Pesuaine                1466
        YHTEENSÄ               24,90
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "unverified");
    assert.equal(receipt.total, 24.9);
    assert.match(
      receipt.verdict.kind === "unverified" ? receipt.verdict.why : "",
      /could not be read as a line/,
    );
  });

  it("does not extend that to a shortfall nothing explains", () => {
    // Every amount on this receipt was read and they still do not reach the
    // total, so there is money in it that nothing on the page supports. That is
    // the original reasoning and it survives — the change above applies only when
    // there is positive evidence of a line going missing.
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        YHTEENSÄ               99,00
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "contradicted");
    assert.equal(receipt.total, null);
  });

  it("contradicts when the lines exceed the total, missing prices or not", () => {
    // OCR drops amounts; it does not invent them. So every price here was on the
    // paper, the receipt's real item total is at least this much, and a total
    // below it is too small whatever else was missed. This is the direction that
    // catches 24,90 read as 21,90.
    const receipt = normalizeReceipt(
      lines(`
        K-MARKET
        Maito                   1,29
        Ruisleipä               2,50
        Juusto                  6,45
        Pesuaine               14,66
        Sillit                   345
        YHTEENSÄ               21,90
      `),
      TODAY,
    );
    assert.equal(receipt.verdict.kind, "contradicted");
    assert.equal(receipt.total, null);
  });
});
