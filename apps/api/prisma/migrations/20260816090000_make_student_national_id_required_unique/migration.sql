-- Student national IDs are mandatory and globally unique.
DROP INDEX IF EXISTS "students_institutionId_nationalId_key";

ALTER TABLE "students"
  ALTER COLUMN "nationalId" TYPE VARCHAR(10),
  ALTER COLUMN "nationalId" SET NOT NULL;

CREATE UNIQUE INDEX "students_nationalId_key" ON "students"("nationalId");
