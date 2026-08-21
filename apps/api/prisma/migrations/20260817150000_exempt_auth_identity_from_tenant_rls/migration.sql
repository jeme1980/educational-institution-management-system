-- Authentication must resolve an active InstitutionUser before a trusted
-- institution context exists. Keep this identity mapping application-scoped;
-- school data remains protected by tenant RLS.
DROP POLICY IF EXISTS institution_users_tenant_policy ON public.institution_users;
ALTER TABLE public.institution_users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.institution_users DISABLE ROW LEVEL SECURITY;
