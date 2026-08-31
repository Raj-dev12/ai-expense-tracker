-- Whether the person picked their currency or just got the default.
--
-- Added with a default of false so every existing row answers "not chosen yet",
-- which is the correct answer for a database seeded before the question existed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "base_currency_chosen" boolean DEFAULT false NOT NULL;
