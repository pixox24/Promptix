import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../drizzle/0017_template_autopublish.sql', import.meta.url);
const journalUrl = new URL('../drizzle/meta/_journal.json', import.meta.url);
const apiSchemaUrl = new URL('../src/db/schema.ts', import.meta.url);
const workerSchemaUrl = new URL('../../worker/src/db.ts', import.meta.url);

test('autopublish migration contains durable orchestration and permit tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'agent_capability_grants',
    'template_autopublish_source_items',
    'template_autopublish_runs',
    'template_autopublish_stage_attempts',
    'template_autopublish_artifacts',
    'template_autopublish_outbox',
    'governance_execution_permits',
  ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  assert.match(sql, /'auto_verified'/);
  assert.match(sql, /'autopilot'/);
  assert.match(sql, /observation_until/);
  assert.match(sql, /template_autopublish_runs_scheduled_source_unique[\s\S]*WHERE "trigger_type" = 'scheduled_agent'/i);
});

test('autopublish Drizzle mirrors retain the migration journal and foreign keys', async () => {
  const [journalText, apiSchema, workerSchema] = await Promise.all([
    readFile(journalUrl, 'utf8'),
    readFile(apiSchemaUrl, 'utf8'),
    readFile(workerSchemaUrl, 'utf8'),
  ]);
  const journal = JSON.parse(journalText);
  assert.deepEqual(journal.entries.at(-1), {
    idx: 17,
    version: '7',
    when: 1784880000000,
    tag: '0017_template_autopublish',
    breakpoints: true,
  });

  // Source checks keep this contract side-effect-free: importing these circular
  // schema modules would initialize the Worker database client and require env.
  for (const [name, source, pattern] of [
    ['API change-set permit', apiSchema, /permitId: uuid\('permit_id'\)\.references\(\(\): AnyPgColumn => governanceExecutionPermits\.id\)/],
    ['API generation run', apiSchema, /autopublishRunId: uuid\('autopublish_run_id'\)\.references\(\(\): AnyPgColumn => templateAutopublishRuns\.id\)/],
    ['Worker grant initiator', workerSchema, /initiatedBy: uuid\('initiated_by'\)\.references\(\(\) => adminUsers\.id\)/],
    ['Worker run requester', workerSchema, /requestedBy: uuid\('requested_by'\)\.references\(\(\) => adminUsers\.id\)/],
    ['Worker run grant', workerSchema, /capabilityGrantId: uuid\('capability_grant_id'\)\.notNull\(\)\.references\(\(\) => agentCapabilityGrants\.id\)/],
    ['Worker run rule set', workerSchema, /ruleSetId: uuid\('rule_set_id'\)\.notNull\(\)\.references\(\(\) => governanceRuleSets\.id\)/],
    ['Worker run template', workerSchema, /templateId: text\('template_id'\)\.references\(\(\) => promptTemplates\.id\)/],
    ['Worker run change set', workerSchema, /changeSetId: uuid\('change_set_id'\)\.references\(\(\) => governanceChangeSets\.id\)/],
    ['Worker artifact run cascade', workerSchema, /runId: uuid\('run_id'\)\.notNull\(\)\.references\(\(\) => templateAutopublishRuns\.id, \{ onDelete: 'cascade' \}\)/],
    ['Worker artifact model', workerSchema, /modelId: uuid\('model_id'\)\.references\(\(\) => providerModels\.id\)/],
    ['Worker attempt artifact', workerSchema, /artifactId: uuid\('artifact_id'\)\.references\(\(\) => templateAutopublishArtifacts\.id\)/],
    ['Worker attempt job', workerSchema, /generationJobId: uuid\('generation_job_id'\)\.references\(\(\) => generationJobs\.id\)/],
    ['Worker outbox run cascade', workerSchema, /runId: uuid\('run_id'\)\.notNull\(\)\.references\(\(\) => templateAutopublishRuns\.id, \{ onDelete: 'cascade' \}\)/],
    ['Worker permit template', workerSchema, /templateId: text\('template_id'\)\.notNull\(\)\.references\(\(\) => promptTemplates\.id\)/],
    ['Worker permit rule set', workerSchema, /ruleSetId: uuid\('rule_set_id'\)\.notNull\(\)\.references\(\(\) => governanceRuleSets\.id\)/],
    ['Worker change-set permit', workerSchema, /permitId: uuid\('permit_id'\)\.references\(\(\): AnyPgColumn => governanceExecutionPermits\.id\)/],
    ['Worker generation run', workerSchema, /autopublishRunId: uuid\('autopublish_run_id'\)\.references\(\(\): AnyPgColumn => templateAutopublishRuns\.id\)/],
  ]) assert.match(source, pattern, `${name} foreign key is mirrored`);

  for (const source of [workerSchema]) {
    assert.match(source, /templateAutopublishStageAttempts[\s\S]*?runId: uuid\('run_id'\)\.notNull\(\)\.references\(\(\) => templateAutopublishRuns\.id, \{ onDelete: 'cascade' \}\)/);
    assert.match(source, /governanceExecutionPermits[\s\S]*?autopublishRunId: uuid\('autopublish_run_id'\)\.notNull\(\)\.references\(\(\) => templateAutopublishRuns\.id, \{ onDelete: 'cascade' \}\)/);
  }
});
