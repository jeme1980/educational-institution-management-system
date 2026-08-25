-- Persist intervention instances and their target snapshots for Phase 4A.
CREATE UNIQUE INDEX "skills_institutionId_id_key" ON "skills"("institutionId", "id");

CREATE TABLE "interventions" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "studyGroupId" UUID NOT NULL,
  "baselineExamId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "activity" TEXT,
  "plannedDuration" VARCHAR(120),
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "successCriterion" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'planned',
  "createdBy" UUID,
  "updatedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "interventions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interventions_institutionId_id_key" UNIQUE ("institutionId", "id"),
  CONSTRAINT "interventions_status_check" CHECK ("status" IN ('planned', 'active', 'completed', 'cancelled')),
  CONSTRAINT "interventions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "interventions_institutionId_academicYearId_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "interventions_institutionId_subjectId_fkey" FOREIGN KEY ("institutionId", "academicYearId", "subjectId") REFERENCES "subjects"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "interventions_institutionId_studyGroupId_fkey" FOREIGN KEY ("institutionId", "studyGroupId") REFERENCES "study_groups"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "interventions_institutionId_baselineExamId_fkey" FOREIGN KEY ("institutionId", "baselineExamId") REFERENCES "exams"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "intervention_students" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "interventionId" UUID NOT NULL,
  "studentEnrollmentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "intervention_students_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "intervention_students_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "intervention_students_institutionId_interventionId_fkey" FOREIGN KEY ("institutionId", "interventionId") REFERENCES "interventions"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "intervention_students_institutionId_studentEnrollmentId_fkey" FOREIGN KEY ("institutionId", "studentEnrollmentId") REFERENCES "student_enrollments"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "intervention_skills" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "interventionId" UUID NOT NULL,
  "skillId" UUID NOT NULL,
  "baselineMastery" DECIMAL(5,2),
  "targetMastery" DECIMAL(5,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "intervention_skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "intervention_skills_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "intervention_skills_institutionId_interventionId_fkey" FOREIGN KEY ("institutionId", "interventionId") REFERENCES "interventions"("institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "intervention_skills_institutionId_skillId_fkey" FOREIGN KEY ("institutionId", "skillId") REFERENCES "skills"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "intervention_skills_mastery_check" CHECK (("baselineMastery" IS NULL OR ("baselineMastery" >= 0 AND "baselineMastery" <= 100)) AND ("targetMastery" IS NULL OR ("targetMastery" >= 0 AND "targetMastery" <= 100)) )
);

CREATE INDEX "interventions_institutionId_academicYearId_subjectId_studyGroupId_idx" ON "interventions"("institutionId", "academicYearId", "subjectId", "studyGroupId");
CREATE INDEX "interventions_institutionId_baselineExamId_idx" ON "interventions"("institutionId", "baselineExamId");
CREATE INDEX "interventions_institutionId_status_archivedAt_idx" ON "interventions"("institutionId", "status", "archivedAt");
CREATE UNIQUE INDEX "intervention_students_interventionId_studentEnrollmentId_key" ON "intervention_students"("interventionId", "studentEnrollmentId");
CREATE INDEX "intervention_students_institutionId_interventionId_idx" ON "intervention_students"("institutionId", "interventionId");
CREATE INDEX "intervention_students_institutionId_studentEnrollmentId_idx" ON "intervention_students"("institutionId", "studentEnrollmentId");
CREATE UNIQUE INDEX "intervention_skills_interventionId_skillId_key" ON "intervention_skills"("interventionId", "skillId");
CREATE INDEX "intervention_skills_institutionId_interventionId_idx" ON "intervention_skills"("institutionId", "interventionId");
CREATE INDEX "intervention_skills_institutionId_skillId_idx" ON "intervention_skills"("institutionId", "skillId");

ALTER TABLE "interventions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "interventions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "intervention_students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_students" FORCE ROW LEVEL SECURITY;
ALTER TABLE "intervention_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intervention_skills" FORCE ROW LEVEL SECURITY;

CREATE POLICY "interventions_rls_policy" ON "interventions" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "intervention_students_rls_policy" ON "intervention_students" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "intervention_skills_rls_policy" ON "intervention_skills" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON TABLE "interventions" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "intervention_students" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "intervention_skills" TO school_app;
