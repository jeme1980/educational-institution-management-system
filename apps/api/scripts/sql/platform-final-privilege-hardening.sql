-- Install after platform callers use the narrow platform_api functions.
BEGIN;
REVOKE SELECT ON TABLE
  public.students,
  public.classes,
  public.topics,
  public.skills,
  public.student_enrollments,
  public.student_guardians,
  public.staff_developments
FROM platform_app;
ALTER ROLE platform_app NOINHERIT;
COMMIT;
