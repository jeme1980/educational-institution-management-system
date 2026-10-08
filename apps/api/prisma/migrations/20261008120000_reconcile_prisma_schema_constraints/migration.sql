-- Reconcile the explicit Institution relations declared in schema.prisma for survey tables.
-- Existing migrations already enforce tenant ownership through composite foreign keys.
-- NOT VALID limits the initial lock; validation verifies existing rows without rewriting data.

ALTER TABLE "surveys" ADD CONSTRAINT "surveys_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "surveys" VALIDATE CONSTRAINT "surveys_institutionId_fkey";

ALTER TABLE "survey_sections" ADD CONSTRAINT "survey_sections_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_sections" VALIDATE CONSTRAINT "survey_sections_institutionId_fkey";

ALTER TABLE "survey_domains" ADD CONSTRAINT "survey_domains_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_domains" VALIDATE CONSTRAINT "survey_domains_institutionId_fkey";

ALTER TABLE "survey_indicators" ADD CONSTRAINT "survey_indicators_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_indicators" VALIDATE CONSTRAINT "survey_indicators_institutionId_fkey";

ALTER TABLE "survey_rounds" ADD CONSTRAINT "survey_rounds_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_rounds" VALIDATE CONSTRAINT "survey_rounds_institutionId_fkey";

ALTER TABLE "survey_segments" ADD CONSTRAINT "survey_segments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_segments" VALIDATE CONSTRAINT "survey_segments_institutionId_fkey";

ALTER TABLE "survey_import_batches" ADD CONSTRAINT "survey_import_batches_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_import_batches" VALIDATE CONSTRAINT "survey_import_batches_institutionId_fkey";

ALTER TABLE "survey_indicator_results" ADD CONSTRAINT "survey_indicator_results_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_indicator_results" VALIDATE CONSTRAINT "survey_indicator_results_institutionId_fkey";

ALTER TABLE "survey_domain_results" ADD CONSTRAINT "survey_domain_results_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_domain_results" VALIDATE CONSTRAINT "survey_domain_results_institutionId_fkey";

ALTER TABLE "survey_domain_comparisons" ADD CONSTRAINT "survey_domain_comparisons_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_domain_comparisons" VALIDATE CONSTRAINT "survey_domain_comparisons_institutionId_fkey";

ALTER TABLE "survey_participation_results" ADD CONSTRAINT "survey_participation_results_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "survey_participation_results" VALIDATE CONSTRAINT "survey_participation_results_institutionId_fkey";
