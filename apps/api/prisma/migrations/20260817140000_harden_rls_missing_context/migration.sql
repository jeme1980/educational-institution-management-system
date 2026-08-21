-- Treat an unset/empty tenant setting as NULL so RLS denies access instead
-- of raising a UUID cast error. This preserves deny-by-default semantics.
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_policy', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING ("institutionId" = NULLIF(current_setting(''app.current_institution_id'', true), '''')::uuid) WITH CHECK ("institutionId" = NULLIF(current_setting(''app.current_institution_id'', true), '''')::uuid)',
      table_name || '_tenant_policy', table_name
    );
  END LOOP;
END $$;
