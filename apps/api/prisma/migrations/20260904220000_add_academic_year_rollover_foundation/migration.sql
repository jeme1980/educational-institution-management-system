-- CreateTable
CREATE TABLE "academic_year_specializations" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "specializationId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_year_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_year_rollovers" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "sourceAcademicYearId" UUID NOT NULL,
    "targetAcademicYearId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_year_rollovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_year_rollover_entity_maps" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "rolloverId" UUID NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "sourceEntityId" UUID NOT NULL,
    "targetEntityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_year_rollover_entity_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_rollover_decisions" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "rolloverId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "sourceEnrollmentId" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "targetGradeLevelId" UUID,
    "targetAcademicYearId" UUID,
    "targetClassId" UUID,
    "targetEnrollmentId" UUID,
    "validationStatus" VARCHAR(20) NOT NULL DEFAULT 'UNRESOLVED',
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_rollover_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_year_specializations_institutionId_academicYearId_isActive_idx" ON "academic_year_specializations"("institutionId", "academicYearId", "isActive");
CREATE INDEX "academic_year_specializations_institutionId_specializationId_idx" ON "academic_year_specializations"("institutionId", "specializationId");
CREATE UNIQUE INDEX "academic_year_specializations_institutionId_academicYearId_specializationId_key" ON "academic_year_specializations"("institutionId", "academicYearId", "specializationId");
CREATE UNIQUE INDEX "academic_year_specializations_institutionId_id_key" ON "academic_year_specializations"("institutionId", "id");

CREATE INDEX "academic_year_rollovers_institutionId_status_idx" ON "academic_year_rollovers"("institutionId", "status");
CREATE INDEX "academic_year_rollovers_institutionId_sourceAcademicYearId_idx" ON "academic_year_rollovers"("institutionId", "sourceAcademicYearId");
CREATE INDEX "academic_year_rollovers_institutionId_targetAcademicYearId_idx" ON "academic_year_rollovers"("institutionId", "targetAcademicYearId");
CREATE UNIQUE INDEX "academic_year_rollovers_institutionId_id_key" ON "academic_year_rollovers"("institutionId", "id");

CREATE INDEX "academic_year_rollover_entity_maps_institutionId_rolloverId_entityType_idx" ON "academic_year_rollover_entity_maps"("institutionId", "rolloverId", "entityType");
CREATE INDEX "academic_year_rollover_entity_maps_institutionId_entityType_sourceEntityId_idx" ON "academic_year_rollover_entity_maps"("institutionId", "entityType", "sourceEntityId");
CREATE UNIQUE INDEX "academic_year_rollover_entity_maps_rolloverId_entityType_sourceEntityId_key" ON "academic_year_rollover_entity_maps"("rolloverId", "entityType", "sourceEntityId");
CREATE UNIQUE INDEX "academic_year_rollover_entity_maps_institutionId_id_key" ON "academic_year_rollover_entity_maps"("institutionId", "id");

CREATE INDEX "student_rollover_decisions_institutionId_rolloverId_validationStatus_idx" ON "student_rollover_decisions"("institutionId", "rolloverId", "validationStatus");
CREATE INDEX "student_rollover_decisions_institutionId_studentId_idx" ON "student_rollover_decisions"("institutionId", "studentId");
CREATE INDEX "student_rollover_decisions_institutionId_sourceEnrollmentId_idx" ON "student_rollover_decisions"("institutionId", "sourceEnrollmentId");
CREATE UNIQUE INDEX "student_rollover_decisions_rolloverId_studentId_key" ON "student_rollover_decisions"("rolloverId", "studentId");
CREATE UNIQUE INDEX "student_rollover_decisions_institutionId_id_key" ON "student_rollover_decisions"("institutionId", "id");

-- Supporting composite keys for tenant-safe relations introduced below
CREATE UNIQUE INDEX "specializations_institutionId_id_key" ON "specializations"("institutionId", "id");
CREATE UNIQUE INDEX "student_enrollments_institutionId_academicYearId_id_key" ON "student_enrollments"("institutionId", "academicYearId", "id");

-- AddForeignKey
ALTER TABLE "academic_year_specializations" ADD CONSTRAINT "academic_year_specializations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_specializations" ADD CONSTRAINT "academic_year_specializations_institutionId_academicYearId_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_specializations" ADD CONSTRAINT "academic_year_specializations_institutionId_specializationId_fkey" FOREIGN KEY ("institutionId", "specializationId") REFERENCES "specializations"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic_year_rollovers" ADD CONSTRAINT "academic_year_rollovers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollovers" ADD CONSTRAINT "academic_year_rollovers_institutionId_sourceAcademicYearId_fkey" FOREIGN KEY ("institutionId", "sourceAcademicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollovers" ADD CONSTRAINT "academic_year_rollovers_institutionId_targetAcademicYearId_fkey" FOREIGN KEY ("institutionId", "targetAcademicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic_year_rollover_entity_maps" ADD CONSTRAINT "academic_year_rollover_entity_maps_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_entity_maps" ADD CONSTRAINT "academic_year_rollover_entity_maps_institutionId_rolloverId_fkey" FOREIGN KEY ("institutionId", "rolloverId") REFERENCES "academic_year_rollovers"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_institutionId_rolloverId_fkey" FOREIGN KEY ("institutionId", "rolloverId") REFERENCES "academic_year_rollovers"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_institutionId_studentId_fkey" FOREIGN KEY ("institutionId", "studentId") REFERENCES "students"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_institutionId_sourceEnrollmentId_fkey" FOREIGN KEY ("institutionId", "sourceEnrollmentId") REFERENCES "student_enrollments"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_target_year_fkey" FOREIGN KEY ("institutionId", "targetAcademicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_target_class_fkey" FOREIGN KEY ("institutionId", "targetAcademicYearId", "targetClassId") REFERENCES "classes"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_target_enrollment_fkey" FOREIGN KEY ("institutionId", "targetAcademicYearId", "targetEnrollmentId") REFERENCES "student_enrollments"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
