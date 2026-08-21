-- Defense-in-depth tenant isolation. Runtime connections must use a
-- non-superuser, NOBYPASSRLS role for these policies to be effective.
-- Missing app.current_institution_id is intentionally deny-by-default.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_state', 'academic_years', 'institution_profiles', 'academic_periods',
    'students', 'staff_members', 'specializations', 'job_roles',
    'staff_assignments', 'staff_developments', 'staff_assignment_subjects',
    'institution_users', 'roles', 'role_permissions', 'institution_user_roles',
    'classes', 'student_enrollments', 'guardians', 'student_guardians',
    'student_medical_profiles', 'subjects', 'topics', 'skills', 'question_types',
    'exam_types', 'study_groups', 'study_group_students', 'exams',
    'exam_study_groups', 'exam_questions', 'student_question_scores',
    'student_exam_results'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING ("institutionId" = current_setting(''app.current_institution_id'', true)::uuid) WITH CHECK ("institutionId" = current_setting(''app.current_institution_id'', true)::uuid)',
      table_name || '_tenant_policy', table_name
    );
  END LOOP;
END $$;
