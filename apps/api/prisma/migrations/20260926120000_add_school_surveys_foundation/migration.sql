-- Aggregate-only, tenant-scoped survey foundation. No respondent identities or
-- individual responses are stored by these tables.
CREATE TABLE "surveys" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameHe" TEXT,
  "descriptionAr" TEXT,
  "descriptionHe" TEXT,
  "audienceType" VARCHAR(40),
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_sections" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameHe" TEXT,
  "descriptionAr" TEXT,
  "descriptionHe" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isOptional" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_domains" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameHe" TEXT,
  "descriptionAr" TEXT,
  "descriptionHe" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_domains_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_indicators" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "domainId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "textAr" TEXT NOT NULL,
  "textHe" TEXT,
  "descriptionAr" TEXT,
  "descriptionHe" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reportingRuleCode" VARCHAR(50),
  "isReverseDirection" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_indicators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_rounds" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameHe" TEXT,
  "sequenceNumber" INTEGER NOT NULL,
  "startsAt" DATE,
  "endsAt" DATE,
  "measurementDate" DATE,
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_segments" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameHe" TEXT,
  "segmentType" VARCHAR(40),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_segments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_import_batches" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "originalFileName" VARCHAR(500) NOT NULL,
  "fileHash" VARCHAR(128) NOT NULL,
  "importedByUserId" UUID,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "rowCount" INTEGER,
  "validRowCount" INTEGER,
  "invalidRowCount" INTEGER,
  "importedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_indicator_results" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "sectionId" UUID NOT NULL,
  "domainId" UUID NOT NULL,
  "indicatorId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "importBatchId" UUID,
  "reportedPercentage" DECIMAL(5,2),
  "respondentCount" INTEGER,
  "earnedTotal" DECIMAL(14,4),
  "possibleTotal" DECIMAL(14,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_indicator_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "survey_indicator_results_percentage_check" CHECK ("reportedPercentage" IS NULL OR ("reportedPercentage" >= 0 AND "reportedPercentage" <= 100))
);

CREATE TABLE "survey_domain_results" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "domainId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "importBatchId" UUID,
  "scorePercentage" DECIMAL(5,2),
  "respondentCount" INTEGER,
  "isComparable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_domain_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "survey_domain_results_percentage_check" CHECK ("scorePercentage" IS NULL OR ("scorePercentage" >= 0 AND "scorePercentage" <= 100))
);

CREATE TABLE "survey_domain_comparisons" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "domainId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "comparisonType" VARCHAR(50) NOT NULL,
  "comparisonCode" VARCHAR(50),
  "comparisonValue" DECIMAL(5,2),
  "comparisonRoundId" UUID,
  "noteAr" TEXT,
  "noteHe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_domain_comparisons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "survey_participation_results" (
  "id" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "surveyId" UUID NOT NULL,
  "roundId" UUID NOT NULL,
  "segmentId" UUID NOT NULL,
  "participantCount" INTEGER,
  "eligibleCount" INTEGER,
  "responseRate" DECIMAL(5,2),
  "importBatchId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "survey_participation_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "survey_participation_results_rate_check" CHECK ("responseRate" IS NULL OR ("responseRate" >= 0 AND "responseRate" <= 100))
);

CREATE UNIQUE INDEX "surveys_institutionId_id_key" ON "surveys"("institutionId", "id");
CREATE UNIQUE INDEX "surveys_institutionId_academicYearId_id_key" ON "surveys"("institutionId", "academicYearId", "id");
CREATE INDEX "surveys_institutionId_academicYearId_idx" ON "surveys"("institutionId", "academicYearId");
CREATE INDEX "surveys_institutionId_status_archivedAt_idx" ON "surveys"("institutionId", "status", "archivedAt");

CREATE UNIQUE INDEX "survey_sections_institutionId_surveyId_code_key" ON "survey_sections"("institutionId", "surveyId", "code");
CREATE UNIQUE INDEX "survey_sections_institutionId_surveyId_id_key" ON "survey_sections"("institutionId", "surveyId", "id");
CREATE INDEX "survey_sections_institutionId_surveyId_sortOrder_idx" ON "survey_sections"("institutionId", "surveyId", "sortOrder");
CREATE UNIQUE INDEX "survey_domains_institutionId_surveyId_code_key" ON "survey_domains"("institutionId", "surveyId", "code");
CREATE UNIQUE INDEX "survey_domains_institutionId_surveyId_id_key" ON "survey_domains"("institutionId", "surveyId", "id");
CREATE INDEX "survey_domains_institutionId_surveyId_sectionId_sortOrder_idx" ON "survey_domains"("institutionId", "surveyId", "sectionId", "sortOrder");
CREATE UNIQUE INDEX "survey_indicators_institutionId_surveyId_code_key" ON "survey_indicators"("institutionId", "surveyId", "code");
CREATE UNIQUE INDEX "survey_indicators_institutionId_surveyId_id_key" ON "survey_indicators"("institutionId", "surveyId", "id");
CREATE INDEX "survey_indicators_institutionId_surveyId_domainId_sortOrder_idx" ON "survey_indicators"("institutionId", "surveyId", "domainId", "sortOrder");

CREATE UNIQUE INDEX "survey_rounds_institutionId_surveyId_code_key" ON "survey_rounds"("institutionId", "surveyId", "code");
CREATE UNIQUE INDEX "survey_rounds_institutionId_surveyId_sequenceNumber_key" ON "survey_rounds"("institutionId", "surveyId", "sequenceNumber");
CREATE UNIQUE INDEX "survey_rounds_institutionId_surveyId_id_key" ON "survey_rounds"("institutionId", "surveyId", "id");
CREATE INDEX "survey_rounds_institutionId_surveyId_sequenceNumber_idx" ON "survey_rounds"("institutionId", "surveyId", "sequenceNumber");
CREATE UNIQUE INDEX "survey_segments_institutionId_surveyId_code_key" ON "survey_segments"("institutionId", "surveyId", "code");
CREATE UNIQUE INDEX "survey_segments_institutionId_surveyId_id_key" ON "survey_segments"("institutionId", "surveyId", "id");
CREATE INDEX "survey_segments_institutionId_surveyId_sortOrder_idx" ON "survey_segments"("institutionId", "surveyId", "sortOrder");

CREATE UNIQUE INDEX "survey_import_batches_institutionId_surveyId_roundId_fileHash_key" ON "survey_import_batches"("institutionId", "surveyId", "roundId", "fileHash");
CREATE UNIQUE INDEX "survey_import_batches_institutionId_id_key" ON "survey_import_batches"("institutionId", "id");
CREATE UNIQUE INDEX "survey_import_batches_institutionId_surveyId_roundId_id_key" ON "survey_import_batches"("institutionId", "surveyId", "roundId", "id");
CREATE INDEX "survey_import_batches_institutionId_surveyId_roundId_createdAt_idx" ON "survey_import_batches"("institutionId", "surveyId", "roundId", "createdAt");
CREATE INDEX "survey_import_batches_importedByUserId_idx" ON "survey_import_batches"("importedByUserId");

CREATE UNIQUE INDEX "survey_indicator_results_roundId_indicatorId_segmentId_key" ON "survey_indicator_results"("roundId", "indicatorId", "segmentId");
CREATE INDEX "survey_indicator_results_institutionId_surveyId_roundId_idx" ON "survey_indicator_results"("institutionId", "surveyId", "roundId");
CREATE INDEX "survey_indicator_results_roundId_domainId_idx" ON "survey_indicator_results"("roundId", "domainId");
CREATE INDEX "survey_indicator_results_roundId_indicatorId_idx" ON "survey_indicator_results"("roundId", "indicatorId");
CREATE INDEX "survey_indicator_results_roundId_segmentId_idx" ON "survey_indicator_results"("roundId", "segmentId");
CREATE UNIQUE INDEX "survey_domain_results_roundId_domainId_segmentId_key" ON "survey_domain_results"("roundId", "domainId", "segmentId");
CREATE INDEX "survey_domain_results_institutionId_surveyId_roundId_idx" ON "survey_domain_results"("institutionId", "surveyId", "roundId");
CREATE UNIQUE INDEX "survey_domain_comparisons_roundId_domainId_segmentId_comparisonType_key" ON "survey_domain_comparisons"("roundId", "domainId", "segmentId", "comparisonType");
CREATE INDEX "survey_domain_comparisons_institutionId_surveyId_roundId_idx" ON "survey_domain_comparisons"("institutionId", "surveyId", "roundId");
CREATE INDEX "survey_domain_comparisons_institutionId_surveyId_comparisonRoundId_idx" ON "survey_domain_comparisons"("institutionId", "surveyId", "comparisonRoundId");
CREATE UNIQUE INDEX "survey_participation_results_roundId_segmentId_key" ON "survey_participation_results"("roundId", "segmentId");
CREATE INDEX "survey_participation_results_institutionId_surveyId_roundId_idx" ON "survey_participation_results"("institutionId", "surveyId", "roundId");

ALTER TABLE "surveys" ADD CONSTRAINT "surveys_institution_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_sections" ADD CONSTRAINT "survey_sections_survey_fkey" FOREIGN KEY ("institutionId", "surveyId") REFERENCES "surveys"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domains" ADD CONSTRAINT "survey_domains_survey_fkey" FOREIGN KEY ("institutionId", "surveyId") REFERENCES "surveys"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domains" ADD CONSTRAINT "survey_domains_section_fkey" FOREIGN KEY ("institutionId", "surveyId", "sectionId") REFERENCES "survey_sections"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicators" ADD CONSTRAINT "survey_indicators_survey_fkey" FOREIGN KEY ("institutionId", "surveyId") REFERENCES "surveys"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicators" ADD CONSTRAINT "survey_indicators_domain_fkey" FOREIGN KEY ("institutionId", "surveyId", "domainId") REFERENCES "survey_domains"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_rounds" ADD CONSTRAINT "survey_rounds_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_rounds" ADD CONSTRAINT "survey_rounds_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_segments" ADD CONSTRAINT "survey_segments_survey_fkey" FOREIGN KEY ("institutionId", "surveyId") REFERENCES "surveys"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_import_batches" ADD CONSTRAINT "survey_import_batches_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_import_batches" ADD CONSTRAINT "survey_import_batches_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_import_batches" ADD CONSTRAINT "survey_import_batches_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_import_batches" ADD CONSTRAINT "survey_import_batches_user_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_section_fkey" FOREIGN KEY ("institutionId", "surveyId", "sectionId") REFERENCES "survey_sections"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_domain_fkey" FOREIGN KEY ("institutionId", "surveyId", "domainId") REFERENCES "survey_domains"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_indicator_fkey" FOREIGN KEY ("institutionId", "surveyId", "indicatorId") REFERENCES "survey_indicators"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_segment_fkey" FOREIGN KEY ("institutionId", "surveyId", "segmentId") REFERENCES "survey_segments"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_batch_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId", "importBatchId") REFERENCES "survey_import_batches"("institutionId", "surveyId", "roundId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_domain_fkey" FOREIGN KEY ("institutionId", "surveyId", "domainId") REFERENCES "survey_domains"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_segment_fkey" FOREIGN KEY ("institutionId", "surveyId", "segmentId") REFERENCES "survey_segments"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_batch_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId", "importBatchId") REFERENCES "survey_import_batches"("institutionId", "surveyId", "roundId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_domain_fkey" FOREIGN KEY ("institutionId", "surveyId", "domainId") REFERENCES "survey_domains"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_segment_fkey" FOREIGN KEY ("institutionId", "surveyId", "segmentId") REFERENCES "survey_segments"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_target_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "comparisonRoundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_year_fkey" FOREIGN KEY ("institutionId", "academicYearId") REFERENCES "academic_years"("institutionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_survey_fkey" FOREIGN KEY ("institutionId", "academicYearId", "surveyId") REFERENCES "surveys"("institutionId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_round_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId") REFERENCES "survey_rounds"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_segment_fkey" FOREIGN KEY ("institutionId", "surveyId", "segmentId") REFERENCES "survey_segments"("institutionId", "surveyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_batch_fkey" FOREIGN KEY ("institutionId", "surveyId", "roundId", "importBatchId") REFERENCES "survey_import_batches"("institutionId", "surveyId", "roundId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "surveys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "surveys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_sections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_domains" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_indicators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_indicators" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_rounds" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_segments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_import_batches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_indicator_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_indicator_results" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_domain_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_domain_results" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_domain_comparisons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_domain_comparisons" FORCE ROW LEVEL SECURITY;
ALTER TABLE "survey_participation_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "survey_participation_results" FORCE ROW LEVEL SECURITY;

CREATE POLICY "surveys_tenant_policy" ON "surveys" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_sections_tenant_policy" ON "survey_sections" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_domains_tenant_policy" ON "survey_domains" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_indicators_tenant_policy" ON "survey_indicators" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_rounds_tenant_policy" ON "survey_rounds" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_segments_tenant_policy" ON "survey_segments" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_import_batches_tenant_policy" ON "survey_import_batches" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_indicator_results_tenant_policy" ON "survey_indicator_results" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_domain_results_tenant_policy" ON "survey_domain_results" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_domain_comparisons_tenant_policy" ON "survey_domain_comparisons" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "survey_participation_results_tenant_policy" ON "survey_participation_results" FOR ALL USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON TABLE "surveys", "survey_sections", "survey_domains", "survey_indicators", "survey_rounds", "survey_segments", "survey_import_batches", "survey_indicator_results", "survey_domain_results", "survey_domain_comparisons", "survey_participation_results" TO school_app;
