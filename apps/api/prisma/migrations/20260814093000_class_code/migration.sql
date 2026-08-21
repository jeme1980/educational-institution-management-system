ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "classCode" VARCHAR(20);

-- Backfill the derived code before enforcing the new business key.
UPDATE "classes" AS c
SET "classCode" = CONCAT(g."codeNumber"::text, '-', c."parallelNumber"::text)
FROM "grade_levels" AS g
WHERE g."id" = c."gradeLevelId"
  AND c."classCode" IS NULL;

DROP INDEX IF EXISTS "classes_institutionId_academicYearId_stageId_classCode_key";
DROP INDEX IF EXISTS "classes_institutionId_academicYearId_stageId_gradeLevelId_p_key";

CREATE UNIQUE INDEX "classes_institutionId_academicYearId_classCode_key"
ON "classes"("institutionId", "academicYearId", "classCode");
