ALTER TABLE "Donor" ADD COLUMN "birthDate" TIMESTAMP(3);

UPDATE "Donor"
SET "birthDate" = (CURRENT_DATE - ("age" * INTERVAL '1 year'))::timestamp(3)
WHERE "age" IS NOT NULL;

ALTER TABLE "Donor" DROP COLUMN "age";
