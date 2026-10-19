-- Explicit POST-runtime-cutover operation only. Never invoked by installer/deployment preparation.
BEGIN;
REVOKE ALL PRIVILEGES ON public.users, public.user_sessions, public.institutions FROM school_app;
DO $block$
DECLARE column_record record;
BEGIN
 FOR column_record IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','user_sessions','institutions') LOOP
  EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM school_app',column_record.column_name,column_record.column_name,column_record.column_name,column_record.column_name,column_record.table_name);
 END LOOP;
END;
$block$;
COMMIT;
