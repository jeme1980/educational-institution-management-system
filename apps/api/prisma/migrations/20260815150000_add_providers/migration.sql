CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "providerCode" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_developments" ADD COLUMN "providerId" UUID;
ALTER TABLE "staff_developments" DROP COLUMN "provider";

CREATE UNIQUE INDEX "providers_institutionId_providerCode_key" ON "providers"("institutionId", "providerCode");
CREATE INDEX "providers_institutionId_isActive_sortOrder_idx" ON "providers"("institutionId", "isActive", "sortOrder");
CREATE INDEX "staff_developments_providerId_idx" ON "staff_developments"("providerId");

ALTER TABLE "providers" ADD CONSTRAINT "providers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_developments" ADD CONSTRAINT "staff_developments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
