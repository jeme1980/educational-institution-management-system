-- Phase 10C-4A: installed after migrations by install-platform-metrics-api.ps1.
-- The installer provisions platform_metrics_definer separately; Prisma's migration
-- credential does not need CREATEROLE or membership in that role.
BEGIN;

CREATE SCHEMA IF NOT EXISTS platform_api;
REVOKE ALL ON SCHEMA platform_api FROM PUBLIC, school_app, platform_app, platform_metrics_definer;
GRANT USAGE, CREATE ON SCHEMA platform_api TO platform_metrics_definer;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM platform_metrics_definer;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM platform_metrics_definer;
GRANT USAGE ON SCHEMA public TO platform_metrics_definer;
GRANT SELECT ON TABLE
  public.institutions,
  public.towns,
  public.students,
  public.staff_members,
  public.institution_users,
  public.classes,
  public.topics,
  public.skills,
  public.student_enrollments,
  public.student_guardians
TO platform_metrics_definer;

-- Required only while installing/replacing functions owned by the NOLOGIN role.
GRANT platform_metrics_definer TO CURRENT_USER;

CREATE OR REPLACE FUNCTION platform_api.platform_get_institution_usage(p_institution_id uuid)
RETURNS TABLE(students bigint, staff bigint, users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  previous_context text := current_setting('app.current_institution_id', true);
  student_count bigint;
  staff_count bigint;
  user_count bigint;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'Institution id is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = p_institution_id) THEN
    RAISE EXCEPTION 'Institution not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.current_institution_id', p_institution_id::text, true);
  SELECT count(*) INTO student_count FROM public.students s
    WHERE s."institutionId" = p_institution_id AND s."isActive" = true;
  SELECT count(*) INTO staff_count FROM public.staff_members sm
    WHERE sm."institutionId" = p_institution_id AND sm."archivedAt" IS NULL;
  SELECT count(*) INTO user_count FROM public.institution_users iu
    WHERE iu."institutionId" = p_institution_id AND iu."isActive" = true AND iu."archivedAt" IS NULL;

  PERFORM set_config('app.current_institution_id', coalesce(previous_context, ''), true);
  RETURN QUERY SELECT student_count, staff_count, user_count;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.current_institution_id', coalesce(previous_context, ''), true);
  RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_api.platform_reference_dependency_counts(
  p_reference_kind text,
  p_reference_id uuid
)
RETURNS TABLE(dependency_type text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  previous_context text := current_setting('app.current_institution_id', true);
  tenant_id uuid;
  first_count bigint := 0;
  second_count bigint := 0;
  third_count bigint := 0;
BEGIN
  IF p_reference_id IS NULL OR p_reference_kind IS NULL OR p_reference_kind NOT IN (
    'regions', 'towns', 'languages', 'educationTypes', 'educationStages',
    'gradeLevels', 'classTypes', 'compositionTypes', 'genders',
    'studentStatuses', 'enrollmentStatuses', 'relationTypes', 'studentFeatures'
  ) THEN
    RAISE EXCEPTION 'Unsupported reference dependency request' USING ERRCODE = '22023';
  END IF;

  -- Global references have no tenant RLS. Every tenant table below is counted
  -- separately under its institution context, including FORCE RLS tables.
  IF p_reference_kind = 'regions' THEN
    SELECT count(*) INTO first_count FROM public.institutions i WHERE i."regionId" = p_reference_id;
    SELECT count(*) INTO second_count FROM public.towns t WHERE t."regionId" = p_reference_id;
  ELSIF p_reference_kind = 'towns' THEN
    SELECT count(*) INTO first_count FROM public.institutions i WHERE i."townId" = p_reference_id;
  ELSIF p_reference_kind = 'languages' THEN
    SELECT count(*) INTO first_count FROM public.institutions i WHERE i."defaultLanguageId" = p_reference_id;
  ELSIF p_reference_kind = 'educationTypes' THEN
    SELECT count(*) INTO first_count FROM public.institutions i WHERE i."typeId" = p_reference_id;
  ELSE
    FOR tenant_id IN SELECT i.id FROM public.institutions i LOOP
      PERFORM set_config('app.current_institution_id', tenant_id::text, true);
      CASE p_reference_kind
        WHEN 'educationStages' THEN
          first_count := first_count + (SELECT count(*) FROM public.classes c WHERE c."stageId" = p_reference_id);
        WHEN 'gradeLevels' THEN
          first_count := first_count + (SELECT count(*) FROM public.classes c WHERE c."gradeLevelId" = p_reference_id);
          second_count := second_count + (SELECT count(*) FROM public.topics t WHERE t."gradeLevelId" = p_reference_id);
          third_count := third_count + (SELECT count(*) FROM public.skills s WHERE s."gradeLevelId" = p_reference_id);
        WHEN 'classTypes' THEN
          first_count := first_count + (SELECT count(*) FROM public.classes c WHERE c."typeId" = p_reference_id);
        WHEN 'compositionTypes' THEN
          first_count := first_count + (SELECT count(*) FROM public.classes c WHERE c."compositionId" = p_reference_id);
        WHEN 'genders' THEN
          first_count := first_count + (SELECT count(*) FROM public.students s WHERE s."genderId" = p_reference_id);
          second_count := second_count + (SELECT count(*) FROM public.staff_members sm WHERE sm."genderId" = p_reference_id);
        WHEN 'studentStatuses' THEN
          first_count := first_count + (SELECT count(*) FROM public.students s WHERE s."studentStatusId" = p_reference_id);
        WHEN 'enrollmentStatuses' THEN
          first_count := first_count + (SELECT count(*) FROM public.student_enrollments se WHERE se."enrollmentStatusId" = p_reference_id);
        WHEN 'relationTypes' THEN
          first_count := first_count + (SELECT count(*) FROM public.student_guardians sg WHERE sg."relationTypeId" = p_reference_id);
        WHEN 'studentFeatures' THEN
          first_count := first_count + (SELECT count(*) FROM public.student_enrollments se WHERE se."studentFeatureId" = p_reference_id);
      END CASE;
    END LOOP;
  END IF;

  -- Towns need both their global institution count and tenant student count.
  IF p_reference_kind = 'towns' THEN
    FOR tenant_id IN SELECT i.id FROM public.institutions i LOOP
      PERFORM set_config('app.current_institution_id', tenant_id::text, true);
      second_count := second_count + (SELECT count(*) FROM public.students s WHERE s."townId" = p_reference_id);
    END LOOP;
  END IF;

  PERFORM set_config('app.current_institution_id', coalesce(previous_context, ''), true);
  IF p_reference_kind IN ('regions', 'towns', 'languages', 'educationTypes') THEN
    RETURN QUERY SELECT 'institutions'::text, first_count;
  ELSIF p_reference_kind IN ('educationStages', 'gradeLevels', 'classTypes', 'compositionTypes') THEN
    RETURN QUERY SELECT 'classes'::text, first_count;
  ELSIF p_reference_kind IN ('genders', 'studentStatuses') THEN
    RETURN QUERY SELECT 'students'::text, first_count;
  ELSIF p_reference_kind = 'enrollmentStatuses' THEN
    RETURN QUERY SELECT 'studentEnrollments'::text, first_count;
  ELSIF p_reference_kind = 'relationTypes' THEN
    RETURN QUERY SELECT 'studentGuardians'::text, first_count;
  ELSE
    RETURN QUERY SELECT 'enrollments'::text, first_count;
  END IF;
  IF p_reference_kind = 'regions' THEN RETURN QUERY SELECT 'towns'::text, second_count; END IF;
  IF p_reference_kind = 'towns' THEN RETURN QUERY SELECT 'students'::text, second_count; END IF;
  IF p_reference_kind = 'gradeLevels' THEN
    RETURN QUERY SELECT 'topics'::text, second_count;
    RETURN QUERY SELECT 'skills'::text, third_count;
  END IF;
  IF p_reference_kind = 'genders' THEN RETURN QUERY SELECT 'staffMembers'::text, second_count; END IF;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.current_institution_id', coalesce(previous_context, ''), true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION platform_api.platform_get_institution_usage(uuid) FROM PUBLIC, school_app;
REVOKE ALL ON FUNCTION platform_api.platform_reference_dependency_counts(text, uuid) FROM PUBLIC, school_app;
ALTER FUNCTION platform_api.platform_get_institution_usage(uuid) OWNER TO platform_metrics_definer;
ALTER FUNCTION platform_api.platform_reference_dependency_counts(text, uuid) OWNER TO platform_metrics_definer;
REVOKE platform_metrics_definer FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA platform_api FROM platform_metrics_definer;
GRANT USAGE ON SCHEMA platform_api TO platform_app;
GRANT EXECUTE ON FUNCTION platform_api.platform_get_institution_usage(uuid) TO platform_app;
GRANT EXECUTE ON FUNCTION platform_api.platform_reference_dependency_counts(text, uuid) TO platform_app;

COMMIT;
