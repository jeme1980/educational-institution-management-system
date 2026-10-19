// Reviewed exact capability signatures/results. Keep in sync with the versioned SQL.
module.exports = [
  {
    "schema": "auth_api",
    "name": "auth_login_identity_email",
    "args": "text",
    "result": "TABLE (\"id\" uuid, \"email\" text, \"normalizedEmail\" text, \"passwordHash\" text, \"securityStamp\" text, \"isActive\" boolean, \"isPlatformAdmin\" boolean, \"mustChangePassword\" boolean, \"failedLoginAttempts\" integer, \"lockedUntil\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_identity_id",
    "args": "uuid",
    "result": "TABLE (\"id\" uuid, \"email\" text, \"normalizedEmail\" text, \"securityStamp\" text, \"isActive\" boolean, \"isPlatformAdmin\" boolean, \"mustChangePassword\" boolean, \"lockedUntil\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_memberships",
    "args": "uuid",
    "result": "TABLE (id uuid, \"institutionId\" uuid, \"isActive\" boolean, \"archivedAt\" timestamp without time zone, \"institutionArchivedAt\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_failed_login",
    "args": "uuid, integer, timestamp without time zone",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_successful_login",
    "args": "uuid",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "session_create",
    "args": "uuid, text, timestamp without time zone, text, text",
    "result": "TABLE (id uuid, \"userId\" uuid, \"expiresAt\" timestamp without time zone, \"revokedAt\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "session_id",
    "args": "uuid",
    "result": "TABLE (id uuid, \"userId\" uuid, \"expiresAt\" timestamp without time zone, \"revokedAt\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "session_hash",
    "args": "text",
    "result": "TABLE (id uuid, \"userId\" uuid, \"expiresAt\" timestamp without time zone, \"revokedAt\" timestamp without time zone)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "session_rotate",
    "args": "uuid, text, text, timestamp without time zone",
    "result": "integer",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "session_revoke_hash",
    "args": "text",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "sessions_revoke_current",
    "args": "uuid",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_upgrade_password",
    "args": "text, text, text",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_password_identity",
    "args": "uuid",
    "result": "TABLE (id uuid,\"passwordHash\" text)",
    "role": "school_auth_app"
  },
  {
    "schema": "auth_api",
    "name": "auth_change_password",
    "args": "uuid, text, text, uuid",
    "result": "boolean",
    "role": "school_auth_app"
  },
  {
    "schema": "school_api",
    "name": "lock_institution",
    "args": "uuid",
    "result": "boolean",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "school_accounts",
    "args": "uuid[]",
    "result": "TABLE (id uuid,email text,\"mustChangePassword\" boolean,\"isActive\" boolean)",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "school_create_identity",
    "args": "text, text, text",
    "result": "TABLE (id uuid,\"mustChangePassword\" boolean)",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "school_setup_stamp",
    "args": "uuid, text",
    "result": "boolean",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "institution_record",
    "args": "uuid",
    "result": "jsonb",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "institution_profile_update",
    "args": "uuid, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean",
    "result": "jsonb",
    "role": "school_app"
  },
  {
    "schema": "school_api",
    "name": "school_revoke_pending_sessions",
    "args": "uuid",
    "result": "boolean",
    "role": "school_app"
  }
];
