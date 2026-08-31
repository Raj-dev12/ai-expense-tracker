import { sql } from "drizzle-orm";
import { env } from "../env.js";
import { addDays, todayIso } from "../lib/dates.js";
import type { CategoryName } from "../lib/categories.js";
import { SEED_CATEGORY_NAMES } from "../lib/categories.js";
import { toMoneyString } from "../lib/money.js";
import { DEMO_USER_EMAIL } from "../lib/user.js";
import { closeDb, db } from "./client.js";
import { categories, expenses, users, type NewExpenseRow } from "./schema.js";

// This script empties the tables before it writes, so it refuses to run unless
// ALLOW_SEED is deliberately set. Production re-seeds itself on purpose, which
// is exactly why the guard has to be a flag someone sets rather than a guess
// based on the environment's name.
if (env.ALLOW_SEED !== "true") {
  console.error("Refusing to seed: set ALLOW_SEED=true in .env first.\nThis script deletes every existing expense.");
  process.exit(1);
}

/**
 * A random number generator that starts from a fixed seed, so re-running this
 * script produces exactly the same expenses every time. Real randomness would
 * mean the charts looked different in every screenshot and no bug involving
 * particular data could ever be reproduced.
 */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260831);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function amountBetween(min: number, max: number): number {
  return Math.round((min + random() * (max - min)) * 100) / 100;
}

const DAYS_OF_HISTORY = 90;

// Each merchant carries its own descriptions, so the generated data never
// produces a line like "IKEA — running shoes". Small detail, but the seed data
// is the first thing anyone looking at the demo actually reads.
type Merchant = { name: string; notes: readonly string[] };

type Plan = {
  category: CategoryName;
  count: number;
  min: number;
  max: number;
  merchants: readonly Merchant[];
};

// Weighted so groceries and bills are the two largest slices of the pie, which
// is what a real month of spending tends to look like.
const PLAN: readonly Plan[] = [
  {
    category: "Groceries",
    count: 28,
    min: 15,
    max: 90,
    merchants: [
      { name: "K-Market", notes: ["Bread and milk", "Bits for dinner"] },
      { name: "S-Market", notes: ["Weekly shop", "Vegetables and fruit"] },
      { name: "Lidl", notes: ["Weekly shop", "Store cupboard basics"] },
      { name: "Prisma", notes: ["Big shop", "Household and groceries"] },
      { name: "Alepa", notes: ["Milk and coffee", "Quick top-up"] },
    ],
  },
  {
    category: "Bills",
    count: 14,
    min: 25,
    max: 130,
    merchants: [
      { name: "Elisa", notes: ["Mobile plan"] },
      { name: "Helen", notes: ["Electricity"] },
      { name: "Telia", notes: ["Broadband"] },
      { name: "HSY", notes: ["Water and waste"] },
    ],
  },
  {
    category: "Restaurants",
    count: 15,
    min: 9,
    max: 55,
    merchants: [
      { name: "Fafa's", notes: ["Lunch"] },
      { name: "Vapiano", notes: ["Dinner with friends"] },
      { name: "Cafe Regatta", notes: ["Coffee and a pastry"] },
      { name: "Sushibar + Wine", notes: ["Dinner out"] },
      { name: "Bar Llamas", notes: ["Tapas and drinks"] },
    ],
  },
  {
    category: "Shopping",
    count: 8,
    min: 15,
    max: 140,
    merchants: [
      { name: "Stockmann", notes: ["Winter jacket", "A birthday present"] },
      { name: "Verkkokauppa", notes: ["Headphones", "Phone charger"] },
      { name: "IKEA", notes: ["Kitchen bits", "Shelves and storage"] },
      { name: "Uniqlo", notes: ["Jumper and socks", "Running shorts"] },
    ],
  },
  {
    category: "Transport",
    count: 12,
    min: 3,
    max: 45,
    merchants: [
      { name: "HSL", notes: ["Tram ticket", "Monthly travel card"] },
      { name: "VR", notes: ["Train to Tampere"] },
      { name: "Bolt", notes: ["Ride home"] },
      { name: "Neste", notes: ["Fuel"] },
    ],
  },
  {
    category: "Entertainment",
    count: 6,
    min: 9,
    max: 55,
    merchants: [
      { name: "Finnkino", notes: ["Cinema"] },
      { name: "Spotify", notes: ["Monthly subscription"] },
      { name: "Tiketti", notes: ["Gig tickets"] },
      { name: "Netflix", notes: ["Monthly subscription"] },
    ],
  },
  {
    category: "Health",
    count: 4,
    min: 12,
    max: 75,
    merchants: [
      { name: "Yliopiston Apteekki", notes: ["Prescription", "Cold remedies"] },
      { name: "Mehiläinen", notes: ["Dentist check-up"] },
      { name: "Terveystalo", notes: ["Physiotherapy"] },
    ],
  },
  {
    category: "Travel",
    count: 3,
    min: 60,
    max: 260,
    merchants: [
      { name: "Finnair", notes: ["Flight home"] },
      { name: "Booking.com", notes: ["Two nights away"] },
      { name: "Norwegian", notes: ["Weekend trip"] },
    ],
  },
  {
    category: "Other",
    count: 3,
    min: 5,
    max: 40,
    merchants: [
      { name: "Posti", notes: ["Parcel postage"] },
      { name: "R-kioski", notes: ["Odds and ends"] },
    ],
  },
];

/**
 * There are no foreign-currency rows any more.
 *
 * The demo data is plain numbers with no inherent currency, which is the whole
 * point now: the base currency is a label, chosen on first visit, and these
 * amounts read as whatever was picked. Rows carrying a real currency would have
 * contradicted that the moment somebody chose anything other than the euro.
 *
 * The conversion code they existed to exercise is still in the repository, off
 * behind FX_CONVERSION. Turning it on and adding rows by hand is the way to see
 * it work.
 */

async function main() {
  const today = todayIso();

  console.log("Emptying the tables...");
  // RESTART IDENTITY resets the categories counter so ids start at 1 again.
  // CASCADE lets the expenses rows go with the user they belong to.
  await db.execute(
    sql`truncate table "expenses", "users", "categories" restart identity cascade`,
  );

  console.log("Inserting the nine categories...");
  await db.insert(categories).values(SEED_CATEGORY_NAMES.map((name) => ({ name })));

  console.log("Inserting the demo user...");
  const [user] = await db
    .insert(users)
    // baseCurrencyChosen stays false, so a freshly seeded demo asks which
    // currency these numbers are in before letting anything be entered.
    .values({ email: DEMO_USER_EMAIL, baseCurrency: "EUR", baseCurrencyChosen: false })
    .returning({ id: users.id });

  if (!user) throw new Error("The demo user could not be created");

  const rows: NewExpenseRow[] = [];

  for (const plan of PLAN) {
    for (let i = 0; i < plan.count; i += 1) {
      const amount = amountBetween(plan.min, plan.max);
      const merchant = pick(plan.merchants);
      rows.push({
        userId: user.id,
        amount: toMoneyString(amount),
        // Plain numbers. The currency column records the base at the moment
        // of writing; nothing reads it while conversion is off, because there
        // is only ever one currency for it to be.
        currency: "EUR",
        amountBase: toMoneyString(amount),
        merchant: merchant.name,
        category: plan.category,
        description: pick(merchant.notes),
        expenseDate: addDays(today, -Math.floor(random() * DAYS_OF_HISTORY)),
        source: "seed",
      });
    }
  }


  console.log(`Inserting ${rows.length} expenses across the last ${DAYS_OF_HISTORY} days...`);
  await db.insert(expenses).values(rows);

  console.log("Seed complete.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Seeding failed:", error);
  await closeDb();
  process.exit(1);
});
