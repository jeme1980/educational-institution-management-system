DROP INDEX IF EXISTS "staff_members_institutionId_staffCode_key";

ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "staffCode";
