import { z } from "zod";
import { env } from "../env.js";
import { HttpError } from "../lib/http-error.js";

/**
 * How many euros one unit of each currency is worth.
 *
 * These are the fallback, used when the rate service cannot be reached. They are
 * deliberately approximate and deliberately fixed: a demo that cannot convert a
 * currency is broken, and a demo that converts it slightly wrong while saying so
 * is merely imperfect.
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

/** Where a rate came from, so the caller can say so rather than guess. */
export type RateSource = "live" | "fallback" | "base";

export type Conversion = {
  amountEur: number;
  rate: number;
  source: RateSource;
  /** The day the rate is actually from, which is not always the day asked for. */
  rateDate: string;
};

/**
 * Frankfurter publishes European Central Bank reference rates: free, no key, no
 * account, and history back to 1999.
 *
 * The reply is validated like anything else arriving from outside. A rate
 * service returning a string, a null, or a currency we did not ask for is not a
 * hypothetical — and an unchecked value here would end up multiplied by
 * somebody's money.
 */
const frankfurterResponseSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string(),
  rates: z.record(z.string(), z.number()),
});

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

type CacheEntry = { rate: number; rateDate: string; fetchedAt: number };

const cache = new Map<string, CacheEntry>();

/** Exposed for tests and for the seed script, which must not depend on the network. */
export function clearRateCache(): void {
  cache.clear();
}

/**
 * Convert using the fixed table. No network, always available, always the same.
 *
 * The seed script uses this deliberately: seeded data has to be reproducible, and
 * a seed that fetched live rates would produce different euro amounts every day,
 * which would defeat the point of a fixed random seed.
 */
export function convertWithStaticRate(amount: number, currency: string): Conversion {
  const rate = STATIC_EUR_RATES[currency];

  if (rate === undefined) {
    throw new HttpError(400, `Unsupported currency: ${currency}`, {
      supported: SUPPORTED_CURRENCIES,
    });
  }

  return {
    amountEur: amount * rate,
    rate,
    source: currency === "EUR" ? "base" : "fallback",
    rateDate: "static",
  };
}

/**
 * Ask Frankfurter what one unit of a currency was worth in euros on a given day.
 *
 * Returns null rather than throwing when anything goes wrong, because the caller
 * always has the fixed table to fall back on and a conversion failure should
 * never become a failed request.
 */
async function fetchRate(currency: string, onDate: string): Promise<CacheEntry | null> {
  const url = `${env.FX_API_URL.replace(/\/$/, "")}/${onDate}?from=${currency}&to=EUR`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn(`Rate service answered ${response.status} for ${currency} on ${onDate}`);
      return null;
    }

    const parsed = frankfurterResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn(`Rate service sent something unusable for ${currency} on ${onDate}`);
      return null;
    }

    const rate = parsed.data.rates.EUR;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      console.warn(`Rate service gave no usable EUR rate for ${currency} on ${onDate}`);
      return null;
    }

    return {
      rate,
      // The central bank publishes on business days only, so a Saturday returns
      // the Friday rate. Frankfurter says which day it actually used, and that
      // is the day worth recording rather than the day we asked about.
      rateDate: parsed.data.date,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.warn(`Could not reach the rate service for ${currency} on ${onDate}: ${reason}`);
    return null;
  }
}

/**
 * Convert an amount into euros using the rate from the day it was spent.
 *
 * The rate on the day is more truthful than today's rate, and with a service
 * that serves history for free it costs nothing extra to be right. Rates are
 * cached: a historical rate never changes, and the same day is asked about over
 * and over as expenses are added.
 *
 * If the service cannot be reached, the fixed table answers instead. The
 * conversion says which happened, so nothing has to pretend a fallback figure is
 * a real one.
 */
export async function convertToEur(
  amount: number,
  currency: string,
  onDate: string,
): Promise<Conversion> {
  if (!Object.hasOwn(STATIC_EUR_RATES, currency)) {
    throw new HttpError(400, `Unsupported currency: ${currency}`, {
      supported: SUPPORTED_CURRENCIES,
    });
  }

  // Euros need no conversion, and asking a rate service about them would be a
  // network call to be told the answer is one.
  if (currency === "EUR") {
    return { amountEur: amount, rate: 1, source: "base", rateDate: onDate };
  }

  const key = `${onDate}|${currency}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      amountEur: amount * cached.rate,
      rate: cached.rate,
      source: "live",
      rateDate: cached.rateDate,
    };
  }

  const fetched = await fetchRate(currency, onDate);
  if (fetched) {
    cache.set(key, fetched);
    return {
      amountEur: amount * fetched.rate,
      rate: fetched.rate,
      source: "live",
      rateDate: fetched.rateDate,
    };
  }

  return convertWithStaticRate(amount, currency);
}
