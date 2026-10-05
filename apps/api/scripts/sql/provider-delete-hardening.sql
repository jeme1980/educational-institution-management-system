-- Phase 10C-4P: install after deploying the Provider deactivate/reactivate API.
-- Historical Provider rows remain readable and updateable; only hard DELETE is removed.
BEGIN;
REVOKE DELETE ON TABLE public.providers FROM platform_app;
COMMIT;
