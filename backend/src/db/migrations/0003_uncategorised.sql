-- Uncategorised is where expenses go when the category holding them is deleted.
--
-- A real row rather than a null or an empty string, so charts, filters and
-- totals treat it like any other category and need no special case. Inserted
-- rather than seeded because a database created before this feature has to gain
-- it without being wiped.
INSERT INTO "categories" ("name") VALUES ('Uncategorised') ON CONFLICT ("name") DO NOTHING;
