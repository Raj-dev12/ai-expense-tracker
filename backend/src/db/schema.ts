import { relations } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Three tables, and the build plan is emphatic about not adding a fourth.

/**
 * One row, for the single demo user. There is no login, but keeping a real
 * users table means logins can be added later without redesigning anything.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("EUR"),
  /**
   * Whether the person has actually picked a currency, as opposed to being given
   * the default. False means the app asks before letting anything be entered —
   * the seeded amounts are plain numbers, and what they are numbers *of* is the
   * first thing worth establishing. The seed script resets it, so a fresh demo
   * always starts with the question.
   */
  baseCurrencyChosen: boolean("base_currency_chosen").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The nine fixed categories. This table is the list's home — the frontend
 * dropdown and the MCP tool descriptions both read from it — but an expense
 * stores the category name as text rather than pointing at a row here. The Zod
 * enum already rejects anything outside the list before it reaches the
 * database, so a foreign key would be a second lock on the same door.
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 40 }).notNull().unique(),
});

/**
 * The real table.
 *
 * `amount` and `currency` are what was actually spent. `amountBase` is the same
 * money converted to euros, which is what every total and chart adds up. Both
 * are `numeric`, never a float: 0.1 + 0.2 does not equal 0.3 in binary floating
 * point, which is fine for physics and unacceptable for money.
 *
 * `source` records how the row arrived — the web form, the MCP server, or the
 * seed script. It costs nothing and it is what lets a demo prove that an outside
 * AI assistant genuinely wrote to this database.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    // The amount expressed in the user's base currency, which is configurable and
    // no longer always the euro. Derived from the amount, the currency and the
    // date, so it is recomputed whenever any of those three change.
    amountBase: numeric("amount_base", { precision: 12, scale: 2 }).notNull(),
    merchant: varchar("merchant", { length: 120 }),
    category: varchar("category", { length: 40 }).notNull(),
    description: text("description"),
    // A `date` column holds a calendar day with no time attached, which removes
    // a whole class of time zone bug from storage.
    expenseDate: date("expense_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    source: varchar("source", { length: 10 }).notNull(),
  },
  (table) => [
    // Almost every read is "this user's expenses, newest first, within a date
    // range". An index on those two columns is what keeps that fast.
    index("expenses_user_date_idx").on(table.userId, table.expenseDate),
    index("expenses_category_idx").on(table.category),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(users, { fields: [expenses.userId], references: [users.id] }),
}));

export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;
