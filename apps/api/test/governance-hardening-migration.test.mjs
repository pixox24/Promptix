import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL('../drizzle/0014_governance_correctness_hardening.sql', import.meta.url);
const repairMigration = new URL('../drizzle/0015_repair_governance_coordination.sql', import.meta.url);

test('governance hardening migration preserves evidence and adds durable coordination', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /prompt_templates.*deleted_at/is);
  assert.match(sql, /governance_change_sets.*execution_mode/is);
  assert.match(sql, /legacy_mixed/);
  assert.match(sql, /governance_change_set_items_proposal_uidx/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "template_governance_state"/);
  assert.match(sql, /template_governance_state_eligibility_idx/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "governance_operation_idempotency"/);
  assert.doesNotMatch(sql, /DROP TABLE\s+"?(governance_proposals|template_versions|governance_audit_events)/i);
});

test('governance coordination repair is additive and safe after a partial migration', async () => {
  const sql = await readFile(repairMigration, 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "governance_change_set_items_proposal_uidx"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "template_governance_state"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "template_governance_state_eligibility_idx"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "governance_operation_idempotency"/);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b/i);
});
