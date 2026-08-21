param(
  [ValidateSet('School', 'Platform')]
  [string]$Profile = 'School',
  [string]$RoleName,
  [string]$RolePassword,
  [string]$AdminUrl = $env:MIGRATION_DATABASE_URL,
  [switch]$RotatePassword,
  [switch]$PersistDevelopmentPlatformUrl,
  [string]$DevelopmentEnvFile = (Join-Path $PSScriptRoot '..\.env')
)

if ([string]::IsNullOrWhiteSpace($RoleName)) {
  $RoleName = if ($Profile -eq 'Platform') {
    if ($env:PLATFORM_RUNTIME_DB_ROLE) { $env:PLATFORM_RUNTIME_DB_ROLE } else { 'platform_app' }
  } else {
    if ($env:RLS_RUNTIME_DB_ROLE) { $env:RLS_RUNTIME_DB_ROLE } else { 'school_app' }
  }
}

if ([string]::IsNullOrWhiteSpace($RolePassword)) {
  $RolePassword = if ($Profile -eq 'Platform') { $env:PLATFORM_RUNTIME_DB_PASSWORD } else { $env:RLS_RUNTIME_DB_PASSWORD }
}

if ($RoleName -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
  throw 'Runtime database role name must be a valid PostgreSQL identifier.'
}

if ([string]::IsNullOrWhiteSpace($RolePassword) -or [string]::IsNullOrWhiteSpace($AdminUrl)) {
  $passwordVariable = if ($Profile -eq 'Platform') { 'PLATFORM_RUNTIME_DB_PASSWORD' } else { 'RLS_RUNTIME_DB_PASSWORD' }
  throw "Set MIGRATION_DATABASE_URL and $passwordVariable before provisioning the $Profile runtime role."
}

$quotedRole = '"' + $RoleName.Replace('"', '""') + '"'
$escapedPassword = $RolePassword.Replace("'", "''")
$existingRolePasswordSql = if ($RotatePassword) {
  "ALTER ROLE $quotedRole PASSWORD '$escapedPassword';"
} else {
  '-- Existing runtime role password preserved; pass -RotatePassword only for an approved rotation.'
}

$schoolTenantTables = @(
  'app_state','academic_years','institution_profiles','academic_periods','students','staff_members',
  'specializations','job_roles','staff_assignments','staff_developments','staff_assignment_subjects',
  'institution_users','roles','role_permissions','institution_user_roles','classes','student_enrollments',
  'guardians','student_guardians','student_medical_profiles','subjects','topics','skills','question_types',
  'exam_types','study_groups','study_group_students','exams','exam_study_groups','exam_questions',
  'student_question_scores','student_exam_results','student_attendance'
)

$schoolReferenceTables = @(
  'genders','towns','providers','regions','languages','education_types','education_stages','grade_levels',
  'class_types','composition_types','institution_statuses','student_statuses','enrollment_statuses',
  'relation_types','student_features','permissions'
)

$platformGrants = @(
  @{ Privileges = 'SELECT, INSERT, UPDATE'; Tables = @('users','user_sessions','user_account_setup_tokens') },
  @{ Privileges = 'SELECT, INSERT, UPDATE'; Tables = @('institutions','plans','institution_subscriptions') },
  @{ Privileges = 'SELECT, INSERT'; Tables = @('platform_audit_logs') },
  @{ Privileges = 'INSERT'; Tables = @('audit_logs') },
  @{ Privileges = 'SELECT, INSERT'; Tables = @('institution_users','staff_members','roles','role_permissions','institution_user_roles') },
  @{ Privileges = 'SELECT'; Tables = @('permissions','institution_statuses','students','classes','topics','skills','student_enrollments','student_guardians','staff_developments') },
  # Platform may mutate only the explicit global reference-data allowlist.
  @{ Privileges = 'SELECT, INSERT, UPDATE, DELETE'; Tables = @(
      'regions','towns','languages','education_types','education_stages','grade_levels',
      'class_types','composition_types','genders','student_statuses','enrollment_statuses',
      'relation_types','student_features','providers'
  ) }
)

$roleSql = @"
DO `$`$
DECLARE
  inherited_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RoleName') THEN
    CREATE ROLE $quotedRole LOGIN PASSWORD '$escapedPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
  ELSE
    -- Managed PostgreSQL owners cannot restate SUPERUSER/BYPASSRLS flags on
    -- existing roles. Those flags are verified separately by runtime tests.
    ALTER ROLE $quotedRole LOGIN NOINHERIT;
    $existingRolePasswordSql
  END IF;

  FOR inherited_role IN
    SELECT granted.rolname
    FROM pg_auth_members membership
    JOIN pg_roles member_role ON member_role.oid = membership.member
    JOIN pg_roles granted ON granted.oid = membership.roleid
    WHERE member_role.rolname = '$RoleName'
  LOOP
    EXECUTE format('REVOKE %I FROM %I', inherited_role, '$RoleName');
  END LOOP;
END
`$`$;
GRANT USAGE ON SCHEMA public TO $quotedRole;
REVOKE CREATE ON SCHEMA public FROM $quotedRole;
"@

function New-ConditionalTablePrivilegeSql(
  [ValidateSet('GRANT', 'REVOKE')][string]$Operation,
  [string]$Privileges,
  [string[]]$Tables
) {
  $preposition = if ($Operation -eq 'GRANT') { 'TO' } else { 'FROM' }
  return ($Tables | ForEach-Object {
    $table = $_
    @"
DO `$`$
BEGIN
  IF to_regclass('public.`"$table`"') IS NOT NULL THEN
    EXECUTE '$Operation $Privileges ON TABLE public.`"$table`" $preposition $quotedRole';
  END IF;
END
`$`$;
"@
  }) -join "`n"
}

if ($Profile -eq 'Platform') {
  $revokeSql = @"
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM $quotedRole;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM $quotedRole;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM $quotedRole;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM $quotedRole;
DO `$`$
BEGIN
  IF to_regclass('public.institution_subscriptions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS platform_runtime_subscription_policy ON public.institution_subscriptions';
    EXECUTE 'CREATE POLICY platform_runtime_subscription_policy ON public.institution_subscriptions FOR ALL TO $quotedRole USING (true) WITH CHECK (true)';
  END IF;
  IF to_regclass('public.user_account_setup_tokens') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS platform_runtime_setup_token_policy ON public.user_account_setup_tokens';
    EXECUTE 'CREATE POLICY platform_runtime_setup_token_policy ON public.user_account_setup_tokens FOR ALL TO $quotedRole USING (true) WITH CHECK (true)';
  END IF;
END
`$`$;
"@
  $grantSql = ($platformGrants | ForEach-Object {
    $privileges = $_.Privileges
    New-ConditionalTablePrivilegeSql -Operation GRANT -Privileges $privileges -Tables $_.Tables
  }) -join "`n"
  $sql = $roleSql + "`n" + $revokeSql + "`n" + $grantSql
} else {
  $tenantGrants = New-ConditionalTablePrivilegeSql -Operation GRANT -Privileges 'SELECT, INSERT, UPDATE, DELETE' -Tables $schoolTenantTables
  $referenceRevokes = New-ConditionalTablePrivilegeSql -Operation REVOKE -Privileges 'INSERT, UPDATE, DELETE' -Tables $schoolReferenceTables
  $referenceGrants = New-ConditionalTablePrivilegeSql -Operation GRANT -Privileges 'SELECT' -Tables $schoolReferenceTables
  $sql = $roleSql + "`n" + $tenantGrants + "`n" + $referenceRevokes + "`n" + $referenceGrants
}

function Invoke-DatabaseSql([string]$Sql) {
  $psqlCommand = if ($env:PSQL_PATH) {
    Get-Command -Name $env:PSQL_PATH -ErrorAction SilentlyContinue
  } else {
    Get-Command -Name 'psql' -ErrorAction SilentlyContinue
  }

  if ($psqlCommand) {
    $psqlUrlBuilder = [UriBuilder]$AdminUrl
    $psqlQueryParts = @($psqlUrlBuilder.Query.TrimStart('?').Split('&', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object {
      $parameterName = ([Uri]::UnescapeDataString(($_ -split '=', 2)[0])).ToLowerInvariant()
      $parameterName -notin @('schema', 'connection_limit', 'pool_timeout')
    })
    $psqlUrlBuilder.Query = $psqlQueryParts -join '&'
    $Sql | & $psqlCommand.Source $psqlUrlBuilder.Uri.AbsoluteUri --no-psqlrc --set ON_ERROR_STOP=1 --quiet
    return $LASTEXITCODE
  }

  $Sql | npx.cmd prisma db execute --url $AdminUrl --stdin
  return $LASTEXITCODE
}

$executionExitCode = Invoke-DatabaseSql $sql
if ($executionExitCode -ne 0) {
  throw "Failed to provision the $Profile runtime database role."
}

Write-Output "$Profile runtime role '$RoleName' provisioned with explicit least-privilege grants."

if ($PersistDevelopmentPlatformUrl) {
  if ($Profile -ne 'Platform') {
    throw 'PersistDevelopmentPlatformUrl is only valid for the Platform profile.'
  }
  if ($env:NODE_ENV -eq 'production') {
    throw 'Refusing to write production database credentials to a local env file.'
  }

  $builder = [UriBuilder]$AdminUrl
  $builder.UserName = $RoleName
  $builder.Password = $RolePassword
  $platformUrl = $builder.Uri.AbsoluteUri
  $resolvedEnvFile = [System.IO.Path]::GetFullPath($DevelopmentEnvFile)
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path -LiteralPath $resolvedEnvFile) {
    $existingLines = [string[]](Get-Content -LiteralPath $resolvedEnvFile)
    if ($existingLines.Count -gt 0) {
      $lines.AddRange($existingLines)
    }
  }

  function Set-LocalEnvironmentValue([string]$Name, [string]$Value) {
    $replacement = $Name + '="' + $Value.Replace('"', '\"') + '"'
    for ($index = 0; $index -lt $lines.Count; $index++) {
      if ($lines[$index] -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) {
        $lines[$index] = $replacement
        return
      }
    }
    $lines.Add($replacement)
  }

  Set-LocalEnvironmentValue 'PLATFORM_DATABASE_URL' $platformUrl
  Set-LocalEnvironmentValue 'PLATFORM_RUNTIME_DB_ROLE' $RoleName
  Set-LocalEnvironmentValue 'PLATFORM_RUNTIME_DB_PASSWORD' $RolePassword
  [System.IO.File]::WriteAllLines($resolvedEnvFile, $lines, [System.Text.UTF8Encoding]::new($false))
  Write-Output 'Restricted platform runtime configuration persisted to the local development environment file.'
}
