ALTER TABLE "providers" DROP CONSTRAINT "providers_institutionId_fkey";
DROP INDEX "providers_institutionId_isActive_sortOrder_idx";
DROP INDEX "providers_institutionId_providerCode_key";
ALTER TABLE "providers" DROP COLUMN "institutionId";
ALTER TABLE "providers" ADD CONSTRAINT "providers_providerCode_key" UNIQUE ("providerCode");
CREATE INDEX "providers_isActive_sortOrder_idx" ON "providers"("isActive", "sortOrder");
