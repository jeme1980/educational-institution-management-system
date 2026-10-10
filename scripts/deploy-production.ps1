param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Require-Variable([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$Name is missing." }
  return $value
}

function Require-Url([string]$Name, [string]$Scheme) {
  $value = Require-Variable $Name
  $uri = $null
  if (-not [Uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne $Scheme) {
    throw "$Name is invalid."
  }
  return $uri
}

function Invoke-CommandChecked([string]$Step, [string]$Executable, [string[]]$Arguments) {
  Write-Output "Running $Step..."
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

if ((Require-Variable 'NODE_ENV') -ne 'production') { throw 'NODE_ENV must be production.' }
$migrationUrl = Require-Url 'MIGRATION_DATABASE_URL' 'postgresql'
$schoolUrl = Require-Url 'RLS_RUNTIME_DATABASE_URL' 'postgresql'
$platformUrl = Require-Url 'PLATFORM_DATABASE_URL' 'postgresql'
$schoolRole = if ($env:RLS_RUNTIME_DB_ROLE) { $env:RLS_RUNTIME_DB_ROLE } else { 'school_app' }
$platformRole = if ($env:PLATFORM_RUNTIME_DB_ROLE) { $env:PLATFORM_RUNTIME_DB_ROLE } else { 'platform_app' }
if ([Uri]::UnescapeDataString($schoolUrl.UserInfo.Split(':')[0]) -ne $schoolRole) { throw 'RLS_RUNTIME_DATABASE_URL role is invalid.' }
if ([Uri]::UnescapeDataString($platformUrl.UserInfo.Split(':')[0]) -ne $platformRole) { throw 'PLATFORM_DATABASE_URL role is invalid.' }
if ([Uri]::UnescapeDataString($migrationUrl.UserInfo.Split(':')[0]) -in @($schoolRole, $platformRole)) { throw 'MIGRATION_DATABASE_URL must use a separate deployment role.' }
foreach ($name in @('RLS_RUNTIME_DB_PASSWORD', 'PLATFORM_RUNTIME_DB_PASSWORD', 'CORS_ORIGINS', 'APP_URL', 'ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL_DAYS', 'WEB_API_ORIGINS')) { [void](Require-Variable $name) }
if ((Require-Variable 'AUTH_JWT_SECRET').Length -lt 32) { throw 'AUTH_JWT_SECRET is invalid.' }
foreach ($name in @('PORT', 'WEB_PORT')) {
  $port = 0
  if (-not [int]::TryParse((Require-Variable $name), [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw "$name is invalid." }
}
foreach ($name in @('APP_URL', 'CORS_ORIGINS', 'WEB_API_ORIGINS')) {
  foreach ($item in (Require-Variable $name).Split(',')) {
    $candidate = $null
    if (-not [Uri]::TryCreate($item.Trim(), [UriKind]::Absolute, [ref]$candidate) -or $candidate.Scheme -ne 'https') { throw "$name is invalid." }
  }
}
$setupUrl = Require-Url 'ACCOUNT_SETUP_URL_BASE' 'https'
if ($setupUrl.Host -in @('localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0') -or $setupUrl.Host.EndsWith('.localhost') -or
  $setupUrl.UserInfo -or $setupUrl.Fragment -or $setupUrl.Query -match '(?i)(^\?|&)token=' -or
  -not $setupUrl.AbsolutePath.TrimEnd('/').EndsWith('/account/setup')) { throw 'ACCOUNT_SETUP_URL_BASE is invalid.' }
if ([bool]$env:PLATFORM_ADMIN_EMAIL -ne [bool]$env:PLATFORM_ADMIN_PASSWORD) { throw 'PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be supplied together.' }
Write-Output 'Production environment preflight passed.'
if ($ValidateOnly) { return }

# Build before any database mutation. A failed build cannot leave a partially
# upgraded database. This script prepares artifacts and the DB; the supervisor
# starts the API and static Web artifact with a separate runtime-only env.
# NODE_ENV=production makes npm omit devDependencies by default, but this
# build host still needs TypeScript and Angular build tools.
Invoke-CommandChecked 'dependency install' 'npm.cmd' @('ci', '--include=dev')
Invoke-CommandChecked 'API build' 'npm.cmd' @('run', 'build:api')
Invoke-CommandChecked 'Web build' 'npm.cmd' @('run', 'build:web')

Invoke-CommandChecked 'school role bootstrap' 'npm.cmd' @('run', 'db:setup-runtime-role', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'platform role bootstrap' 'npm.cmd' @('run', 'db:setup-platform-role', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'Prisma validation' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'apps/api/scripts/run-prisma-migration.ps1', '-Action', 'Validate')

# Prisma exits 1 when a fresh database has unapplied migrations. Accept only
# that documented state; every other status failure stops the deployment.
$previousErrorAction = $ErrorActionPreference
try {
  # Windows PowerShell promotes a native tool's stderr warning to an error
  # record under Stop. The Prisma status exit code remains authoritative.
  $ErrorActionPreference = 'Continue'
  $migrationStatus = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'apps/api/scripts/run-prisma-migration.ps1' -Action Status 2>&1
  $statusExit = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorAction
}
if ($statusExit -ne 0 -and (($migrationStatus -join "`n") -notmatch 'not yet been applied')) { throw 'Prisma migration status failed.' }
Write-Output 'Prisma migration preflight passed.'
Invoke-CommandChecked 'Prisma migrate deploy' 'npm.cmd' @('run', 'db:migrate:deploy')
Invoke-CommandChecked 'Prisma post-migration status' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'apps/api/scripts/run-prisma-migration.ps1', '-Action', 'Status')

# Reapply role grants after migration creates new tables, then install the
# versioned narrow API and the two independent privilege hardening artifacts.
Invoke-CommandChecked 'school grants' 'npm.cmd' @('run', 'db:setup-runtime-role', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'platform grants' 'npm.cmd' @('run', 'db:setup-platform-role', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'Platform Metrics API' 'npm.cmd' @('run', 'db:install-platform-metrics-api', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'Provider DELETE hardening' 'npm.cmd' @('run', 'db:install-provider-delete-hardening', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'final Platform privilege hardening' 'npm.cmd' @('run', 'db:install-platform-final-privilege-hardening', '--workspace', '@school-management-system/api')
Invoke-CommandChecked 'production reference bootstrap' 'npm.cmd' @('run', 'db:bootstrap')
Invoke-CommandChecked 'final migration and ACL verification' 'node.exe' @('scripts/verify-production-db.cjs')
Write-Output 'Deployment preparation passed. Start API and Web artifacts through the runtime supervisor, then check /api/health and /api/ready.'
