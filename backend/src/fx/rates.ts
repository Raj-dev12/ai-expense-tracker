import { HttpError } from "../lib/http-error.js";

/**
 * How many euros one unit of each currency is worth.
 *
 * Hour 4 adds live rates from the Frankfurter API, cached for 24 hours and
 * looked up against the expense's own date. This table stays as the fallback
 * for when that API is unreachable — building it first means the conversion
 * path already works and hour 4 only has to make it more accurate.
 */
export const STATIC_EUR_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.05,
  SEK: 0.088,
  NOK: 0.086,
  DKK: 0.134,
  PLN: 0.23,
  CZK: 0.04,
  JPY: 0.0062,
  CAD: 0.68,
  AUD: 0.6,
};

export const SUPPORTED_CURRENCIES = Object.keys(STATIC_EUR_RATES);

/** Convert an amount in some currency into euros. */
export function convertToEur(amount: number, currency: string): number {
  const rate = STATIC_EUR_RATES[currency];

  if (rate === undefined) {
    throw new HttpError(400, `Unsupported currency: ${currency}`, {
      supported: SUPPORTED_CURRENCIES,
    });
  }

  return amount * rate;
}
