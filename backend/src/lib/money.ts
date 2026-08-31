/**
 * Money is stored in a `numeric` column, which PostgreSQL keeps as an exact
 * decimal. Drizzle hands those values back as strings rather than JavaScript
 * numbers, deliberately: a string cannot quietly lose precision on the way
 * through. This helper is the one place a number becomes that stored string.
 */
export function toMoneyString(value: number): string {
  // Number.EPSILON nudges values that landed a hair below the halfway point
  // during earlier arithmetic, so 1.005 rounds up rather than down.
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}
