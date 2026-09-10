import type { FastifyPluginAsync } from "fastify";
import { findCategory } from "../ai/extract.js";
import { UNCATEGORISED } from "../lib/categories.js";
import { categoryNames } from "../lib/category-store.js";
import { todayIso } from "../lib/dates.js";
import { HttpError } from "../lib/http-error.js";
import { getDemoUser } from "../lib/user.js";
import { validate } from "../lib/validate.js";
import { isConversionEnabled } from "../fx/rates.js";
import { normalizeReceipt } from "../receipts/normalize.js";
import { expenseSuggestionSchema } from "../schemas/ai.js";
import { readReceiptRequestSchema, receiptDataSchema } from "../schemas/receipt.js";

export const receiptRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Turn the text off a photographed receipt into a suggested expense.
   *
   * It saves nothing, and that is the same promise the parse endpoint makes for
   * the same reason: a person reads what came back, corrects it, and only then
   * does anything reach POST /api/expenses. Here the promise is easier to keep
   * than usual — there is no AI in this path at all. The OCR ran in the browser
   * and this is arithmetic.
   *
   * The response carries two things rather than one. `suggestion` is the same
   * shape the parse endpoint returns, so the confirm step can use the fields it
   * already has. `receipt` is everything that shape has no room for — the line
   * items, the VAT figure, and the verdict on whether the total can be believed
   * — which is what the confirm step needs in order to ask a person to *verify*
   * rather than to approve.
   */
  app.post("/api/receipts/read", async (request) => {
    const input = validate(readReceiptRequestSchema, request.body, "receipt");
    const { baseCurrency } = await getDemoUser();
    const available = await categoryNames();

    const receipt = normalizeReceipt(input.lines, input.today ?? todayIso());

    // Checked on the way out like any other produced value. Nothing here came
    // from a model, but a shape this specific is worth asserting rather than
    // trusting — particularly the verdict, where the guarantee that a
    // contradicted reading carries no usable total is structural.
    const checked = receiptDataSchema.safeParse(receipt);
    if (!checked.success) {
      request.log.error({ issues: checked.error.issues }, "the receipt reader produced something unusable");
      throw new HttpError(500, "The receipt could not be read");
    }

    const guessed = findCategory(
      [receipt.merchant ?? "", ...receipt.items.map((item) => item.description ?? "")].join(" "),
    );

    const suggestion = {
      // Null whenever the total was not corroborated or merely unverified — a
      // contradicted reading never becomes an amount. See receipts/checks.ts.
      amount: receipt.total,
      currency: isConversionEnabled() ? receipt.currency : baseCurrency,
      merchant: receipt.merchant,
      // The same fallback the parse endpoint uses: a guess at a category
      // somebody has since deleted is a suggestion the confirm step could not
      // save.
      category: available.includes(guessed.category) ? guessed.category : UNCATEGORISED,
      // The one place the line items survive. They are not stored — there is no
      // table for them and the build plan is emphatic about not adding one — but
      // written into the note they keep what was actually bought, which is the
      // part of a receipt an expense otherwise throws away.
      description:
        receipt.items.length > 0
          ? receipt.items
              .map((item) => item.description)
              .filter(Boolean)
              .join(", ")
              .slice(0, 500) || null
          : null,
      expenseDate: receipt.date,
      dateNote: receipt.date === null ? "No date could be read from this receipt." : null,
    };

    const checkedSuggestion = expenseSuggestionSchema.safeParse(suggestion);
    if (!checkedSuggestion.success) {
      request.log.error(
        { issues: checkedSuggestion.error.issues },
        "the receipt reader produced an unusable suggestion",
      );
      throw new HttpError(500, "The receipt could not be read");
    }

    return {
      // Stated explicitly, because it is the promise this endpoint makes.
      saved: false,
      receipt: checked.data,
      suggestion: checkedSuggestion.data,
    };
  });
};
