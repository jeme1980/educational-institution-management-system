param(
  [string]$AdminUrl = $env:MIGRATION_DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($AdminUrl)) {
  throw 'MIGRATION_DATABASE_URL is required to install the platform metrics API.'
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
    if ($LASTEXITCODE -ne 0) { throw 'Platform metrics SQL execution failed.' }
    return
  }

  $Sql | npx.cmd prisma db execute --url $AdminUrl --stdin
  if ($LASTEXITCODE -ne 0) { throw 'Platform metrics SQL execution failed.' }
}

# Role provisioning lives outside Prisma migrations: the migration credential
# only needs schema migration rights, while this deployment step requires
# CREATEROLE (or a provisioning administrator).
$roleSql = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_metrics_definer') THEN
    CREATE ROLE platform_metrics_definer NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
      NOCREATEDB NOCREATEROLE NOREPLICATION;
  ELSE
    IF EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = 'platform_metrics_definer'
        AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
    ) THEN
      RAISE EXCEPTION 'Existing platform_metrics_definer has privileged attributes';
    END IF;
    ALTER ROLE platform_metrics_definer NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'platform_metrics_definer'
  ) OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
    WHERE r.rolname = 'platform_metrics_definer'
  ) THEN
    RAISE EXCEPTION 'platform_metrics_definer must have no memberships or table ownership';
  END IF;
END;
$$;
'@

Invoke-DatabaseSql $roleSql
$artifactPath = Join-Path $PSScriptRoot 'sql\platform-metrics-api.sql'
Invoke-DatabaseSql (Get-Content -LiteralPath $artifactPath -Raw -Encoding utf8)
Write-Output 'Platform metrics API installed with restricted SECURITY DEFINER ownership.'
