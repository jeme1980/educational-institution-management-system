-- Enforce institution-safe guardian links and one medical profile per student enrollment context.
CREATE UNIQUE INDEX "guardians_institution_id_key"
  ON "guardians" ("institutionId", "id");

ALTER TABLE "student_guardians"
  DROP CONSTRAINT IF EXISTS "student_guardians_studentId_fkey",
  DROP CONSTRAINT IF EXISTS "student_guardians_guardianId_fkey";

ALTER TABLE "student_guardians"
  ADD CONSTRAINT "student_guardians_institution_student_fkey"
    FOREIGN KEY ("institutionId", "studentId")
    REFERENCES "students" ("institutionId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_guardians_institution_guardian_fkey"
    FOREIGN KEY ("institutionId", "guardianId")
    REFERENCES "guardians" ("institutionId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "student_medical_profiles_studentId_key";
ALTER TABLE "student_medical_profiles"
  DROP CONSTRAINT IF EXISTS "student_medical_profiles_studentId_fkey";
ALTER TABLE "student_medical_profiles"
  ADD CONSTRAINT "student_medical_profiles_institution_student_fkey"
    FOREIGN KEY ("institutionId", "studentId")
    REFERENCES "students" ("institutionId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "student_medical_profiles_institution_student_key"
  ON "student_medical_profiles" ("institutionId", "studentId");

CREATE UNIQUE INDEX "student_guardians_primary_contact_key"
  ON "student_guardians" ("institutionId", "studentId")
  WHERE "isPrimaryContact" = true;

ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;
ALTER TABLE "student_guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_guardians" FORCE ROW LEVEL SECURITY;
ALTER TABLE "student_medical_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_medical_profiles" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guardians_rls_policy" ON "guardians";
CREATE POLICY "guardians_rls_policy" ON "guardians" FOR ALL
  USING ("institutionId" = current_setting('app.current_institution_id', true)::uuid)
  WITH CHECK ("institutionId" = current_setting('app.current_institution_id', true)::uuid);
DROP POLICY IF EXISTS "student_guardians_rls_policy" ON "student_guardians";
CREATE POLICY "student_guardians_rls_policy" ON "student_guardians" FOR ALL
  USING ("institutionId" = current_setting('app.current_institution_id', true)::uuid)
  WITH CHECK ("institutionId" = current_setting('app.current_institution_id', true)::uuid);
DROP POLICY IF EXISTS "student_medical_profiles_rls_policy" ON "student_medical_profiles";
CREATE POLICY "student_medical_profiles_rls_policy" ON "student_medical_profiles" FOR ALL
  USING ("institutionId" = current_setting('app.current_institution_id', true)::uuid)
  WITH CHECK ("institutionId" = current_setting('app.current_institution_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guardians" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_guardians" TO school_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "student_medical_profiles" TO school_app;
