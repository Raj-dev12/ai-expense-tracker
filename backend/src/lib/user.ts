import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export const DEMO_USER_EMAIL = "demo@expense-tracker.local";

export type DemoUser = { id: string; baseCurrency: string; baseCurrencyChosen: boolean };

/**
 * There is no login, so the server decides which user a request belongs to.
 * That decision is made here and nowhere else, and the answer is never taken
 * from the request — a client that could name its own user id would be a hole
 * with no authentication standing behind it.
 *
 * The row is deliberately NOT cached in memory. The seed script empties the
 * tables and inserts a fresh user with a new id, and production re-seeds itself
 * while the server is running. A cached id would survive that and quietly point
 * at a user who no longer exists, so every query would return nothing and the
 * app would look empty rather than broken — the worst kind of bug to be handed.
 * The base currency has the same problem for a different reason: it is settable
 * at runtime, and a cached copy would go stale the moment somebody changed it.
 *
 * The cost is one lookup on a unique, indexed column per request, which is far
 * cheaper than the mistake it prevents.
 *
 * When real logins arrive one day, this function changes and nothing else does.
 */
export async function getDemoUser(): Promise<DemoUser> {
  const columns = {
    id: users.id,
    baseCurrency: users.baseCurrency,
    baseCurrencyChosen: users.baseCurrencyChosen,
  };

  const found = await db.select(columns).from(users).where(eq(users.email, DEMO_USER_EMAIL)).limit(1);

  if (found[0]) return found[0];

  // Create the demo user on first use, so the app works before it is seeded.
  const created = await db
    .insert(users)
    .values({ email: DEMO_USER_EMAIL, baseCurrency: "EUR" })
    .onConflictDoNothing()
    .returning(columns);

  if (created[0]) return created[0];

  // Another request inserted it first; read it back.
  const retry = await db.select(columns).from(users).where(eq(users.email, DEMO_USER_EMAIL)).limit(1);

  if (!retry[0]) throw new Error("Could not find or create the demo user");

  return retry[0];
}

/** Most callers only need the id, and saying so keeps them shorter. */
export async function getDemoUserId(): Promise<string> {
  return (await getDemoUser()).id;
}

/**
 * Record the currency, and that it was actually chosen.
 *
 * The two go together on purpose: the only way to set a currency is to pick one,
 * and picking one is what answers the first-visit question. Nothing else ever
 * needs to flip the flag on its own.
 */
export async function setBaseCurrency(userId: string, baseCurrency: string): Promise<void> {
  await db
    .update(users)
    .set({ baseCurrency, baseCurrencyChosen: true })
    .where(eq(users.id, userId));
}
