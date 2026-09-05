CREATE TABLE "academic_year_rollover_class_mappings" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "rolloverId" UUID NOT NULL,
  "sourceClassId" UUID NOT NULL,
  "action" VARCHAR(20) NOT NULL DEFAULT 'SKIP',
  "validationStatus" VARCHAR(20) NOT NULL DEFAULT 'UNRESOLVED',
  "targetStageId" UUID,
  "targetGradeLevelId" UUID,
  "targetClassId" UUID,
  "targetParallelNumber" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_year_rollover_class_mappings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "student_rollover_decisions" ALTER COLUMN "action" DROP NOT NULL;
ALTER TABLE "student_rollover_decisions" ADD COLUMN "targetClassMappingId" UUID;

CREATE UNIQUE INDEX "classes_institutionId_id_key" ON "classes"("institutionId", "id");

CREATE UNIQUE INDEX "academic_year_rollover_class_mappings_rolloverId_sourceClassId_key" ON "academic_year_rollover_class_mappings"("rolloverId", "sourceClassId");
CREATE UNIQUE INDEX "academic_year_rollover_class_mappings_institutionId_id_key" ON "academic_year_rollover_class_mappings"("institutionId", "id");
CREATE INDEX "academic_year_rollover_class_mappings_institutionId_rolloverId_validationStatus_idx" ON "academic_year_rollover_class_mappings"("institutionId", "rolloverId", "validationStatus");
CREATE INDEX "academic_year_rollover_class_mappings_institutionId_sourceClassId_idx" ON "academic_year_rollover_class_mappings"("institutionId", "sourceClassId");
CREATE INDEX "student_rollover_decisions_institutionId_targetClassMappingId_idx" ON "student_rollover_decisions"("institutionId", "targetClassMappingId");

ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_rollover_fkey" FOREIGN KEY ("institutionId", "rolloverId") REFERENCES "academic_year_rollovers"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_source_class_fkey" FOREIGN KEY ("institutionId", "sourceClassId") REFERENCES "classes"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_target_class_fkey" FOREIGN KEY ("institutionId", "targetClassId") REFERENCES "classes"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_stage_fkey" FOREIGN KEY ("targetStageId") REFERENCES "education_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_year_rollover_class_mappings" ADD CONSTRAINT "academic_year_rollover_class_mappings_grade_fkey" FOREIGN KEY ("targetGradeLevelId") REFERENCES "grade_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_rollover_decisions" ADD CONSTRAINT "student_rollover_decisions_class_mapping_fkey" FOREIGN KEY ("institutionId", "targetClassMappingId") REFERENCES "academic_year_rollover_class_mappings"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic_year_rollover_class_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_rollover_class_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_year_rollover_class_mappings_tenant_policy" ON "academic_year_rollover_class_mappings" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academic_year_rollover_class_mappings" TO school_app;
