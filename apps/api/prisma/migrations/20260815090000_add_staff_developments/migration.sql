CREATE TABLE "staff_developments" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "courseCode" VARCHAR(20) NOT NULL,
    "courseName" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(150),
    "hoursCount" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    CONSTRAINT "staff_developments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_developments_institutionId_staffMemberId_courseCode_key" ON "staff_developments"("institutionId", "staffMemberId", "courseCode");
CREATE INDEX "staff_developments_institutionId_staffMemberId_idx" ON "staff_developments"("institutionId", "staffMemberId");
CREATE INDEX "staff_developments_startDate_endDate_idx" ON "staff_developments"("startDate", "endDate");
ALTER TABLE "staff_developments" ADD CONSTRAINT "staff_developments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_developments" ADD CONSTRAINT "staff_developments_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
