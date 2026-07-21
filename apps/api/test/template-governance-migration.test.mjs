import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../drizzle/0010_template_governance.sql', import.meta.url);
const repairMigrationUrl = new URL('../drizzle/0011_backfill_missing_template_versions.sql', import.meta.url);
const seedUrl = new URL('../src/db/seed.ts', import.meta.url);

test('template governance migration is additive and creates the full audit model', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.match(migration, /ALTER TABLE "prompt_templates" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL/);

  for (const table of [
    'template_versions',
    'governance_rule_sets',
    'agent_runs',
    'governance_proposals',
    'governance_change_sets',
    'governance_change_set_items',
    'governance_approvals',
    'governance_audit_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }

  assert.match(migration, /template_versions_template_version_uidx/);
  assert.match(migration, /governance_change_sets_idempotency_key_uidx/);
  assert.match(migration, /governance_proposals_run_template_uidx/);
  assert.match(migration, /governance_change_set_items_change_set_proposal_uidx/);
});

test('migration backfills version one and seeds conservative active rules idempotently', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /INSERT INTO "template_versions"/);
  assert.match(migration, /jsonb_build_object/);
  assert.match(migration, /FROM "prompt_templates"/);
  assert.match(migration, /ON CONFLICT \("template_id", "version"\) DO NOTHING/);

  assert.match(migration, /INSERT INTO "governance_rule_sets"/);
  assert.match(migration, /"0 3 \* \* \*"/);
  assert.match(migration, /"Asia\/Shanghai"/);
  assert.match(migration, /"scanLimit": 50/);
  assert.match(migration, /"minimumAutoConfidence": 0\.85/);
  assert.match(migration, /"slotLimit": 12/);
  assert.match(migration, /"maximumReplacementRatio": 0\.2/);
  assert.match(migration, /"minimumAdjustmentHours": 24/);
  assert.match(migration, /ON CONFLICT \("name", "version"\) DO NOTHING/);
});

test('governance states and risk levels are database constrained', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /agent_runs_status_check/);
  assert.match(migration, /governance_proposals_risk_level_check/);
  assert.match(migration, /governance_change_sets_status_check/);
  assert.match(migration, /governance_change_set_items_status_check/);
  assert.match(migration, /governance_approvals_decision_check/);
  assert.match(migration, /governance_proposals_confidence_check/);
});

test('later seeded templates receive an idempotent version-one snapshot', async () => {
  const repairMigration = await readFile(repairMigrationUrl, 'utf8');
  const seed = await readFile(seedUrl, 'utf8');

  assert.match(repairMigration, /INSERT INTO "template_versions"/);
  assert.match(repairMigration, /FROM "prompt_templates"/);
  assert.match(repairMigration, /ON CONFLICT \("template_id", "version"\) DO NOTHING/);
  assert.doesNotMatch(repairMigration, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);

  assert.match(seed, /buildTemplateVersionSnapshot/);
  assert.match(seed, /db\.insert\(templateVersions\)/);
  assert.match(seed, /version: 1/);
  assert.match(seed, /\.onConflictDoNothing\(\)/);
});
