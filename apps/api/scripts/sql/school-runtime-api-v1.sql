-- school runtime capability API v1. Install only; legacy ACL cutover is separate.
BEGIN;
CREATE SCHEMA IF NOT EXISTS auth_api;
REVOKE ALL ON SCHEMA auth_api FROM PUBLIC, school_app, platform_app;
GRANT USAGE ON SCHEMA auth_api TO school_auth_app;
REVOKE CREATE ON SCHEMA auth_api FROM school_auth_app;
GRANT USAGE, CREATE ON SCHEMA auth_api TO school_runtime_definer;
ALTER DEFAULT PRIVILEGES FOR ROLE school_runtime_definer REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS school_api;
REVOKE ALL ON SCHEMA school_api FROM PUBLIC;
GRANT USAGE ON SCHEMA school_api TO school_app;
GRANT USAGE, CREATE ON SCHEMA school_api TO school_runtime_definer;
REVOKE CREATE ON SCHEMA school_api FROM school_app;
GRANT USAGE ON SCHEMA public TO school_runtime_definer;
GRANT SELECT ("id","email","normalizedEmail","passwordHash","securityStamp","isActive","isPlatformAdmin","mustChangePassword","failedLoginAttempts","lockedUntil") ON public.users TO school_runtime_definer;
GRANT INSERT (id,email,"normalizedEmail","passwordHash","securityStamp","isActive","mustChangePassword","updatedAt") ON public.users TO school_runtime_definer;
GRANT UPDATE ("passwordHash","securityStamp","failedLoginAttempts","lockedUntil","lastLoginAt","updatedAt") ON public.users TO school_runtime_definer;
GRANT SELECT(id,"institutionId","userId","isActive","archivedAt") ON public.institution_users TO school_runtime_definer;
GRANT SELECT(id,"archivedAt"), UPDATE(id) ON public.institutions TO school_runtime_definer;
GRANT SELECT(id,"userId","expiresAt","revokedAt","refreshTokenHash"), INSERT(id,"userId","refreshTokenHash","expiresAt","ipAddress","userAgent","updatedAt"), UPDATE("refreshTokenHash","expiresAt","lastUsedAt","revokedAt","updatedAt") ON public.user_sessions TO school_runtime_definer;


DROP FUNCTION IF EXISTS auth_api.auth_login_identity_email(text);
DROP FUNCTION IF EXISTS school_api.school_create_identity(text,text,text);
DROP FUNCTION IF EXISTS school_api.auth_identity_email(text);
DROP FUNCTION IF EXISTS school_api.auth_identity_id(uuid);
DROP FUNCTION IF EXISTS school_api.auth_memberships(uuid);
DROP FUNCTION IF EXISTS school_api.auth_failed_login(uuid,integer,timestamp);
DROP FUNCTION IF EXISTS school_api.auth_successful_login(uuid);
DROP FUNCTION IF EXISTS school_api.auth_password_hash(uuid,text,text);
DROP FUNCTION IF EXISTS school_api.session_create(uuid,text,timestamp,text,text);
DROP FUNCTION IF EXISTS school_api.session_id(uuid);
DROP FUNCTION IF EXISTS school_api.session_hash(text);
DROP FUNCTION IF EXISTS school_api.session_rotate(uuid,text,text,timestamp,timestamp);
DROP FUNCTION IF EXISTS school_api.session_revoke(uuid);
DROP FUNCTION IF EXISTS school_api.sessions_revoke_user(uuid);
GRANT INSERT ON public.audit_logs, public.platform_audit_logs TO school_runtime_definer;
CREATE OR REPLACE FUNCTION auth_api.auth_login_identity_email(p_email text) RETURNS TABLE ("id" uuid, "email" text, "normalizedEmail" text, "passwordHash" text, "securityStamp" text, "isActive" boolean, "isPlatformAdmin" boolean, "mustChangePassword" boolean, "failedLoginAttempts" integer, "lockedUntil" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT u."id", u."email"::text, u."normalizedEmail"::text, u."passwordHash"::text, u."securityStamp"::text, u."isActive", u."isPlatformAdmin", u."mustChangePassword", u."failedLoginAttempts", u."lockedUntil" FROM public.users u WHERE u."normalizedEmail"=p_email LIMIT 1
$function$;
ALTER FUNCTION auth_api.auth_login_identity_email(text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_login_identity_email(text) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_login_identity_email(text) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_identity_id(p_id uuid) RETURNS TABLE ("id" uuid, "email" text, "normalizedEmail" text, "securityStamp" text, "isActive" boolean, "isPlatformAdmin" boolean, "mustChangePassword" boolean, "lockedUntil" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT u."id", u."email"::text, u."normalizedEmail"::text, u."securityStamp"::text, u."isActive", u."isPlatformAdmin", u."mustChangePassword", u."lockedUntil" FROM public.users u WHERE u.id=p_id
$function$;
ALTER FUNCTION auth_api.auth_identity_id(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_identity_id(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_identity_id(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_memberships(p_user uuid) RETURNS TABLE (id uuid, "institutionId" uuid, "isActive" boolean, "archivedAt" timestamp, "institutionArchivedAt" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT m.id,m."institutionId",m."isActive",m."archivedAt",i."archivedAt" FROM public.institution_users m JOIN public.institutions i ON i.id=m."institutionId" WHERE m."userId"=p_user
$function$;
ALTER FUNCTION auth_api.auth_memberships(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_memberships(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_memberships(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_failed_login(p_user uuid, p_attempts integer, p_locked timestamp) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN UPDATE public.users SET "failedLoginAttempts"=p_attempts,"lockedUntil"=p_locked,"updatedAt"=timezone('UTC',statement_timestamp()) WHERE id=p_user AND p_attempts BETWEEN 0 AND 2147483647; RETURN FOUND; END;
$function$;
ALTER FUNCTION auth_api.auth_failed_login(uuid,integer,timestamp) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_failed_login(uuid,integer,timestamp) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_failed_login(uuid,integer,timestamp) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_successful_login(p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN UPDATE public.users SET "failedLoginAttempts"=0,"lockedUntil"=NULL,"lastLoginAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp()) WHERE id=p_user; RETURN FOUND; END;
$function$;
ALTER FUNCTION auth_api.auth_successful_login(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_successful_login(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_successful_login(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.session_create(p_user uuid, p_hash text, p_expires timestamp, p_ip text, p_agent text) RETURNS TABLE (id uuid, "userId" uuid, "expiresAt" timestamp, "revokedAt" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
INSERT INTO public.user_sessions(id,"userId","refreshTokenHash","expiresAt","ipAddress","userAgent","updatedAt") SELECT gen_random_uuid(),u.id,p_hash,p_expires,p_ip,p_agent,timezone('UTC',statement_timestamp()) FROM public.users u WHERE u.id=p_user AND u."isActive" AND NOT u."mustChangePassword" AND (u."lockedUntil" IS NULL OR u."lockedUntil"<=timezone('UTC',statement_timestamp())) AND p_expires>timezone('UTC',statement_timestamp()) AND p_expires<=timezone('UTC',statement_timestamp())+interval '30 days 1 minute'  RETURNING id,"userId","expiresAt","revokedAt"
$function$;
ALTER FUNCTION auth_api.session_create(uuid,text,timestamp,text,text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.session_create(uuid,text,timestamp,text,text) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.session_create(uuid,text,timestamp,text,text) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.session_id(p_id uuid) RETURNS TABLE (id uuid, "userId" uuid, "expiresAt" timestamp, "revokedAt" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT s.id,s."userId",s."expiresAt",s."revokedAt" FROM public.user_sessions s WHERE s.id=p_id
$function$;
ALTER FUNCTION auth_api.session_id(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.session_id(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.session_id(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.session_hash(p_hash text) RETURNS TABLE (id uuid, "userId" uuid, "expiresAt" timestamp, "revokedAt" timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT s.id,s."userId",s."expiresAt",s."revokedAt" FROM public.user_sessions s WHERE s."refreshTokenHash"=p_hash
$function$;
ALTER FUNCTION auth_api.session_hash(text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.session_hash(text) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.session_hash(text) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.session_rotate(p_id uuid,p_old text,p_new text,p_expires timestamp) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE n integer; BEGIN
IF p_expires<=timezone('UTC',statement_timestamp()) OR p_expires>timezone('UTC',statement_timestamp())+interval '30 days 1 minute' THEN RETURN 0; END IF;
UPDATE public.user_sessions SET "refreshTokenHash"=p_new,"expiresAt"=p_expires,"lastUsedAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp())
WHERE id=p_id AND "refreshTokenHash"=p_old AND "revokedAt" IS NULL AND "expiresAt">timezone('UTC',statement_timestamp());
GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END;
$function$;
ALTER FUNCTION auth_api.session_rotate(uuid,text,text,timestamp) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.session_rotate(uuid,text,text,timestamp) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.session_rotate(uuid,text,text,timestamp) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.session_revoke_hash(p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN UPDATE public.user_sessions SET "revokedAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp()) WHERE "refreshTokenHash"=p_hash AND "revokedAt" IS NULL; RETURN FOUND; END;
$function$;
ALTER FUNCTION auth_api.session_revoke_hash(text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.session_revoke_hash(text) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.session_revoke_hash(text) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.sessions_revoke_current(p_session uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE target uuid; BEGIN
SELECT s."userId" INTO target FROM public.user_sessions s WHERE s.id=p_session AND s."revokedAt" IS NULL AND s."expiresAt">timezone('UTC',statement_timestamp()) FOR UPDATE;
IF target IS NULL THEN RETURN false; END IF;
UPDATE public.user_sessions SET "revokedAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp()) WHERE "userId"=target AND "revokedAt" IS NULL; RETURN true; END;
$function$;
ALTER FUNCTION auth_api.sessions_revoke_current(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.sessions_revoke_current(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.sessions_revoke_current(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_upgrade_password(p_email text,p_old text,p_new text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN UPDATE public.users SET "passwordHash"=p_new,"updatedAt"=timezone('UTC',statement_timestamp()) WHERE "normalizedEmail"=p_email AND "passwordHash"=p_old AND "isActive" AND NOT "mustChangePassword"; RETURN FOUND; END;
$function$;
ALTER FUNCTION auth_api.auth_upgrade_password(text,text,text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_upgrade_password(text,text,text) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_upgrade_password(text,text,text) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_password_identity(p_session uuid) RETURNS TABLE (id uuid,"passwordHash" text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT u.id,u."passwordHash"::text FROM public.users u JOIN public.user_sessions s ON s."userId"=u.id WHERE s.id=p_session AND s."revokedAt" IS NULL AND s."expiresAt">timezone('UTC',statement_timestamp()) AND u."isActive" AND NOT u."mustChangePassword"
$function$;
ALTER FUNCTION auth_api.auth_password_identity(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_password_identity(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_password_identity(uuid) TO school_auth_app;

CREATE OR REPLACE FUNCTION auth_api.auth_change_password(p_session uuid,p_old text,p_new text,p_institution uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE target uuid; platform boolean; prior_context text; BEGIN
SELECT u.id,u."isPlatformAdmin" INTO target,platform FROM public.users u JOIN public.user_sessions s ON s."userId"=u.id WHERE s.id=p_session AND s."revokedAt" IS NULL AND s."expiresAt">timezone('UTC',statement_timestamp()) AND u."isActive" AND NOT u."mustChangePassword" AND u."passwordHash"=p_old FOR UPDATE OF u,s;
IF target IS NULL THEN RETURN false; END IF;
IF NOT platform AND NOT EXISTS(SELECT 1 FROM public.institution_users m JOIN public.institutions i ON i.id=m."institutionId" WHERE m."userId"=target AND m."institutionId"=p_institution AND m."isActive" AND m."archivedAt" IS NULL AND i."archivedAt" IS NULL) THEN RETURN false; END IF;
UPDATE public.users SET "passwordHash"=p_new,"securityStamp"=gen_random_uuid()::text,"failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=timezone('UTC',statement_timestamp()) WHERE id=target;
UPDATE public.user_sessions SET "revokedAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp()) WHERE "userId"=target AND "revokedAt" IS NULL;
IF platform THEN
INSERT INTO public.platform_audit_logs(id,"actorUserId",action,"entityType","entityId",metadata) VALUES(gen_random_uuid(),target,'PASSWORD_CHANGED','User',target,'{"selfService":true}'::jsonb);
ELSE
prior_context:=current_setting('app.current_institution_id',true);
PERFORM set_config('app.current_institution_id',p_institution::text,true);
INSERT INTO public.audit_logs(id,"institutionId","actorUserId",action,"entityType","entityId") VALUES(gen_random_uuid(),p_institution,target,'PASSWORD_CHANGED','User',target);
PERFORM set_config('app.current_institution_id',COALESCE(prior_context,''),true);
END IF; RETURN true; END;
$function$;
ALTER FUNCTION auth_api.auth_change_password(uuid,text,text,uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION auth_api.auth_change_password(uuid,text,text,uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION auth_api.auth_change_password(uuid,text,text,uuid) TO school_auth_app;


GRANT SELECT ON public.institutions TO school_runtime_definer;
GRANT UPDATE ("nameAr","nameHe","phoneNumber",email,"logoUrl","updatedAt") ON public.institutions TO school_runtime_definer;
CREATE OR REPLACE FUNCTION school_api.lock_institution(p_institution uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN IF p_institution IS DISTINCT FROM NULLIF(current_setting('app.current_institution_id',true),'')::uuid THEN RETURN false; END IF; PERFORM i.id FROM public.institutions i WHERE i.id=p_institution FOR NO KEY UPDATE; RETURN FOUND; END;
$function$;
ALTER FUNCTION school_api.lock_institution(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.lock_institution(uuid) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.lock_institution(uuid) TO school_app;

CREATE OR REPLACE FUNCTION school_api.school_accounts(p_ids uuid[]) RETURNS TABLE (id uuid,email text,"mustChangePassword" boolean,"isActive" boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT u.id,u.email::text,u."mustChangePassword",u."isActive" FROM public.users u WHERE u.id=ANY(p_ids) AND EXISTS (SELECT 1 FROM public.institution_users m WHERE m."userId"=u.id AND m."institutionId"=NULLIF(current_setting('app.current_institution_id',true),'')::uuid)
$function$;
ALTER FUNCTION school_api.school_accounts(uuid[]) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.school_accounts(uuid[]) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.school_accounts(uuid[]) TO school_app;

CREATE OR REPLACE FUNCTION school_api.school_create_identity(p_email text,p_hash text,p_stamp text) RETURNS TABLE (id uuid,"mustChangePassword" boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
DECLARE new_id uuid; BEGIN IF NOT EXISTS(SELECT 1 FROM public.institutions i WHERE i.id=NULLIF(current_setting('app.current_institution_id',true),'')::uuid AND i."archivedAt" IS NULL) THEN RAISE EXCEPTION 'Institution context required' USING ERRCODE='42501'; END IF;
IF EXISTS(SELECT 1 FROM public.users u WHERE u."normalizedEmail"=p_email AND u."isPlatformAdmin") THEN RETURN QUERY SELECT NULL::uuid,false; RETURN; END IF;
SELECT u.id INTO new_id FROM public.users u WHERE u."normalizedEmail"=p_email AND NOT u."isPlatformAdmin";
IF new_id IS NOT NULL THEN RETURN QUERY SELECT u.id,u."mustChangePassword" FROM public.users u WHERE u.id=new_id; RETURN; END IF;
INSERT INTO public.users AS inserted(id,email,"normalizedEmail","passwordHash","securityStamp","isActive","mustChangePassword","updatedAt") VALUES(gen_random_uuid(),p_email,p_email,p_hash,p_stamp,true,true,timezone('UTC',statement_timestamp())) RETURNING inserted.id INTO new_id; RETURN QUERY SELECT u.id,u."mustChangePassword" FROM public.users u WHERE u.id=new_id; END;
$function$;
ALTER FUNCTION school_api.school_create_identity(text,text,text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.school_create_identity(text,text,text) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.school_create_identity(text,text,text) TO school_app;

CREATE OR REPLACE FUNCTION school_api.school_setup_stamp(p_user uuid,p_stamp text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN UPDATE public.users u SET "securityStamp"=p_stamp,"updatedAt"=timezone('UTC',statement_timestamp()) WHERE u.id=p_user AND u."mustChangePassword" AND EXISTS(SELECT 1 FROM public.institution_users m WHERE m."userId"=u.id AND m."institutionId"=NULLIF(current_setting('app.current_institution_id',true),'')::uuid); RETURN FOUND; END;
$function$;
ALTER FUNCTION school_api.school_setup_stamp(uuid,text) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.school_setup_stamp(uuid,text) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.school_setup_stamp(uuid,text) TO school_app;


CREATE OR REPLACE FUNCTION school_api.institution_record(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
SELECT to_jsonb(i) FROM public.institutions i WHERE i.id=p_id
AND i.id=NULLIF(current_setting('app.current_institution_id',true),'')::uuid AND i."archivedAt" IS NULL
$function$;
ALTER FUNCTION school_api.institution_record(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.institution_record(uuid) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.institution_record(uuid) TO school_app;
CREATE OR REPLACE FUNCTION school_api.institution_profile_update(p_id uuid,p_name_ar text,p_name_ar_set boolean,p_name_he text,p_name_he_set boolean,p_phone text,p_phone_set boolean,p_email text,p_email_set boolean,p_logo text,p_logo_set boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
IF p_id IS DISTINCT FROM NULLIF(current_setting('app.current_institution_id',true),'')::uuid THEN RETURN NULL; END IF;
UPDATE public.institutions i SET
"nameAr"=CASE WHEN p_name_ar_set THEN p_name_ar ELSE i."nameAr" END,
"nameHe"=CASE WHEN p_name_he_set THEN p_name_he ELSE i."nameHe" END,
"phoneNumber"=CASE WHEN p_phone_set THEN p_phone ELSE i."phoneNumber" END,
email=CASE WHEN p_email_set THEN p_email ELSE i.email END,
"logoUrl"=CASE WHEN p_logo_set THEN p_logo ELSE i."logoUrl" END,"updatedAt"=timezone('UTC',statement_timestamp())
WHERE i.id=p_id AND i."archivedAt" IS NULL;
RETURN school_api.institution_record(p_id);
END;
$function$;
ALTER FUNCTION school_api.institution_profile_update(uuid,text,boolean,text,boolean,text,boolean,text,boolean,text,boolean) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.institution_profile_update(uuid,text,boolean,text,boolean,text,boolean,text,boolean,text,boolean) FROM PUBLIC, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.institution_profile_update(uuid,text,boolean,text,boolean,text,boolean,text,boolean,text,boolean) TO school_app;


CREATE OR REPLACE FUNCTION school_api.school_revoke_pending_sessions(p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $function$
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.users u JOIN public.institution_users m ON m."userId"=u.id WHERE u.id=p_user AND u."mustChangePassword" AND m."institutionId"=NULLIF(current_setting('app.current_institution_id',true),'')::uuid) THEN RETURN false; END IF;
UPDATE public.user_sessions SET "revokedAt"=timezone('UTC',statement_timestamp()),"updatedAt"=timezone('UTC',statement_timestamp()) WHERE "userId"=p_user AND "revokedAt" IS NULL; RETURN true; END;
$function$;
ALTER FUNCTION school_api.school_revoke_pending_sessions(uuid) OWNER TO school_runtime_definer;
REVOKE ALL ON FUNCTION school_api.school_revoke_pending_sessions(uuid) FROM PUBLIC, school_app, school_auth_app, platform_app;
GRANT EXECUTE ON FUNCTION school_api.school_revoke_pending_sessions(uuid) TO school_app;


REVOKE CREATE ON SCHEMA school_api, auth_api FROM school_runtime_definer;
COMMIT;
