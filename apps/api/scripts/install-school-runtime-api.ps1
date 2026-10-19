param(
  [string]$AdminUrl = $env:MIGRATION_DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($AdminUrl)) {
  throw 'MIGRATION_DATABASE_URL is required to install the school/auth runtime APIs.'
}

function Invoke-DatabaseSql([string]$Sql) {
  $psqlCommand = if ($env:PSQL_PATH) {
    Get-Command -Name $env:PSQL_PATH -ErrorAction SilentlyContinue
  } else {
    Get-Command -Name 'psql' -ErrorAction SilentlyContinue
  }

  if ($psqlCommand) {
    $urlBuilder = [UriBuilder]$AdminUrl
    $queryParts = @($urlBuilder.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object {
      $parameterName = ([Uri]::UnescapeDataString(($_ -split '=', 2)[0])).ToLowerInvariant()
      $parameterName -notin @('schema', 'connection_limit', 'pool_timeout')
    })
    $urlBuilder.Query = $queryParts -join '&'
    $Sql | & $psqlCommand.Source $urlBuilder.Uri.AbsoluteUri --no-psqlrc --set ON_ERROR_STOP=1 --quiet
    if ($LASTEXITCODE -ne 0) { throw 'School runtime capability SQL execution failed.' }
    return
  }

  $Sql | npx.cmd prisma db execute --url $AdminUrl --stdin
  if ($LASTEXITCODE -ne 0) { throw 'School runtime capability SQL execution failed.' }
}

# Role provisioning lives outside Prisma migrations: the migration credential
# only needs schema migration rights, while this deployment step requires
# CREATEROLE (or a provisioning administrator).
$roleSql = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'school_runtime_definer') THEN
    CREATE ROLE school_runtime_definer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSE
    IF EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'school_runtime_definer'
        AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
    ) THEN
      RAISE EXCEPTION 'Existing school_runtime_definer has privileged attributes';
    END IF;
    ALTER ROLE school_runtime_definer NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'school_runtime_definer'
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
    WHERE r.rolname = 'school_runtime_definer'
  ) THEN
    RAISE EXCEPTION 'school_runtime_definer must have no memberships or table ownership';
  END IF;
END;
$$;
'@

if ([string]::IsNullOrWhiteSpace($env:AUTH_RUNTIME_DB_PASSWORD)) { throw 'AUTH_RUNTIME_DB_PASSWORD is required.' }
$escapedAuthPassword = $env:AUTH_RUNTIME_DB_PASSWORD.Replace("'", "''")
$authRoleSql = @"
DO `$`$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='school_auth_app') THEN
 CREATE ROLE school_auth_app LOGIN PASSWORD '$escapedAuthPassword' NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='school_auth_app' AND (rolsuper OR rolbypassrls OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin)) OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='school_auth_app'::regrole) OR EXISTS(SELECT 1 FROM pg_class WHERE relowner='school_auth_app'::regrole) OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner='school_auth_app'::regrole) OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner='school_auth_app'::regrole) THEN
 RAISE EXCEPTION 'Unsafe authentication runtime role'; END IF;
END
`$`$;
REVOKE CREATE ON SCHEMA public FROM school_auth_app;
"@
Invoke-DatabaseSql $authRoleSql
Invoke-DatabaseSql $roleSql
$artifactPath = Join-Path $PSScriptRoot 'sql\school-runtime-api-v1.sql'
Invoke-DatabaseSql (Get-Content -LiteralPath $artifactPath -Raw -Encoding utf8)
Write-Output 'School runtime capability API installed with restricted SECURITY DEFINER ownership.'
