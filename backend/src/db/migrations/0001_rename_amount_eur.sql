-- Written by hand rather than generated.
--
-- drizzle-kit cannot tell a rename from "drop one column, add another" without
-- being asked interactively, and the answer it guesses would throw away every
-- stored figure in the table. A RENAME keeps the data exactly where it is and
-- takes no time at all, because PostgreSQL only rewrites the catalogue.
ALTER TABLE "expenses" RENAME COLUMN "amount_eur" TO "amount_base";
