-- The runtime role may append and read audit events, but cannot modify or delete them.
GRANT SELECT, INSERT ON TABLE "audit_logs" TO school_app;
