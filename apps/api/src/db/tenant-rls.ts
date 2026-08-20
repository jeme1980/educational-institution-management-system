import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TABLES_WITH_INSTITUTION = [
  'academic_years',
  'app_state',
  'institution_profiles',
  'academic_periods',
  'students',
  'staff_members',
  'specializations',
  'job_roles',
  'staff_assignments',
  'staff_developments',
  'staff_assignment_subjects',
  'institution_users',
  'roles',
  'role_permissions',
  'institution_user_roles',
  'classes',
  'student_enrollments',
  'student_attendance',
  'guardians',
  'student_guardians',
  'student_medical_profiles',
  'subjects',
  'topics',
  'skills',
  'question_types',
  'exam_types',
  'study_groups',
  'study_group_students',
  'exams',
  'exam_study_groups',
  'exam_questions',
  'student_exam_results',
  'student_question_scores',
];

export function buildRlsPolicySql(tableName: string): string {
  return [
    `CREATE POLICY ${tableName}_rls_policy ON ${tableName}`,
    `FOR ALL`,
    `USING ("institutionId" = current_setting('app.current_institution_id', true)::uuid)`,
    `WITH CHECK ("institutionId" = current_setting('app.current_institution_id', true)::uuid);`,
  ].join(' ');
}

export function buildRlsMigrationSql(): string {
  const statements = TABLES_WITH_INSTITUTION.flatMap((tableName) => [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;`,
    buildRlsPolicySql(tableName),
  ]);

  return statements.join('\n');
}

export function getRlsMigrationSqlFromFile(filePath = 'apps/api/src/db/rls-migration.sql'): string {
  return readFileSync(resolve(process.cwd(), filePath), 'utf8');
}
