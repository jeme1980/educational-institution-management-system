import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildRlsPolicySql } from './tenant-rls';

test('buildRlsPolicySql emits a policy that uses the current institution setting', () => {
  const sql = buildRlsPolicySql('academic_years');

  assert.match(sql, /CREATE POLICY academic_years_rls_policy/i);
  assert.match(sql, /current_setting\('app\.current_institution_id', true\)/i);
  assert.match(sql, /FOR ALL/i);
});
