DROP INDEX IF EXISTS "institution_users_userId_key";
DROP INDEX IF EXISTS "institution_users_staffMemberId_key";

CREATE UNIQUE INDEX "institution_users_institutionId_userId_key"
  ON "institution_users" ("institutionId", "userId");
