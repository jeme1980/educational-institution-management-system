ALTER TABLE "genders" ADD COLUMN "genderCode" VARCHAR(1);

UPDATE "genders"
SET "genderCode" = 'u'
WHERE "genderCode" IS NULL;

ALTER TABLE "genders" ALTER COLUMN "genderCode" SET NOT NULL;

CREATE UNIQUE INDEX "genders_genderCode_key" ON "genders"("genderCode");
