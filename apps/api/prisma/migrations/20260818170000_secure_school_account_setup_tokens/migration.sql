-- School administrators issue setup tokens through the tenant-scoped API.
-- Scope this global identity table through the target user's InstitutionUser
-- membership instead of granting unrestricted runtime access.
ALTER TABLE public.user_account_setup_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_setup_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_account_setup_tokens_tenant_policy ON public.user_account_setup_tokens;
CREATE POLICY user_account_setup_tokens_tenant_policy
ON public.user_account_setup_tokens
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.institution_users AS membership
    WHERE membership."userId" = user_account_setup_tokens."userId"
      AND membership."institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.institution_users AS membership
    WHERE membership."userId" = user_account_setup_tokens."userId"
      AND membership."institutionId" = NULLIF(current_setting('app.current_institution_id', true), '')::uuid
  )
);

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_account_setup_tokens TO school_app;
