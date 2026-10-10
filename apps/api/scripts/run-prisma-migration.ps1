param(
  [ValidateSet('Validate', 'Status', 'Deploy')]
  [string]$Action = 'Deploy'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:MIGRATION_DATABASE_URL)) {
  throw 'MIGRATION_DATABASE_URL is required for Prisma migration commands.'
}

$previousDatabaseUrl = $env:DATABASE_URL
try {
  # Prisma's schema names DATABASE_URL; map the deployment-only credential only
  # within this child process. API startup never calls this script.
  $env:DATABASE_URL = $env:MIGRATION_DATABASE_URL
  $schema = Join-Path $PSScriptRoot '..\prisma\schema.prisma'
  [string[]]$prismaAction = switch ($Action) {
    'Validate' { @('validate') }
    'Status' { @('migrate', 'status') }
    'Deploy' { @('migrate', 'deploy') }
  }
  & npx.cmd prisma @prismaAction --schema $schema
  $result = $LASTEXITCODE
} finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}
exit $result
