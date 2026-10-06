param(
  [string]$AdminUrl = $env:MIGRATION_DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($AdminUrl)) {
  throw 'MIGRATION_DATABASE_URL is required for final platform privilege hardening.'
}

$artifactPath = Join-Path $PSScriptRoot 'sql\platform-final-privilege-hardening.sql'
npx.cmd prisma db execute --url $AdminUrl --file $artifactPath
if ($LASTEXITCODE -ne 0) { throw 'Final platform privilege hardening SQL execution failed.' }
Write-Output 'Platform direct tenant SELECT revoked and platform_app set to NOINHERIT.'
