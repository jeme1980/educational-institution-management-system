CREATE TABLE "specializations" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nameAr" VARCHAR(100) NOT NULL,
    "nameHe" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_members" ADD COLUMN "specializationId" UUID;

CREATE UNIQUE INDEX "specializations_institutionId_nameAr_key"
ON "specializations"("institutionId", "nameAr");

CREATE INDEX "specializations_institutionId_isActive_sortOrder_idx"
ON "specializations"("institutionId", "isActive", "sortOrder");

CREATE INDEX "staff_members_specializationId_idx"
ON "staff_members"("specializationId");

ALTER TABLE "specializations"
ADD CONSTRAINT "specializations_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_members"
ADD CONSTRAINT "staff_members_specializationId_fkey"
FOREIGN KEY ("specializationId") REFERENCES "specializations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
