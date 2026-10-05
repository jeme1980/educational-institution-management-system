param(
  [string]$AdminUrl = $env:MIGRATION_DATABASE_URL
)

if ([string]::IsNullOrWhiteSpace($AdminUrl)) {
  throw 'MIGRATION_DATABASE_URL is required to harden Provider DELETE.'
}

$artifactPath = Join-Path $PSScriptRoot 'sql\provider-delete-hardening.sql'
npx.cmd prisma db execute --url $AdminUrl --file $artifactPath
if ($LASTEXITCODE -ne 0) { throw 'Provider DELETE hardening SQL execution failed.' }
Write-Output 'Provider DELETE privilege revoked from platform_app.'
