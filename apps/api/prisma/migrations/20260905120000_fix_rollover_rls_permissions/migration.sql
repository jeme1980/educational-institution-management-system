-- Give the school runtime role the same tenant-scoped access contract as
-- established academic-year data. A missing institution setting denies access.
ALTER TABLE "academic_year_specializations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_specializations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_rollovers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_rollovers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_rollover_entity_maps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_year_rollover_entity_maps" FORCE ROW LEVEL SECURITY;
ALTER TABLE "student_rollover_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_rollover_decisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "academic_year_specializations_tenant_policy" ON "academic_year_specializations" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "academic_year_rollovers_tenant_policy" ON "academic_year_rollovers" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "academic_year_rollover_entity_maps_tenant_policy" ON "academic_year_rollover_entity_maps" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);
CREATE POLICY "student_rollover_decisions_tenant_policy" ON "student_rollover_decisions" FOR ALL
  USING ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid)
  WITH CHECK ("institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON TABLE "academic_year_specializations" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academic_year_rollovers" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "academic_year_rollover_entity_maps" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_rollover_decisions" TO school_app;
