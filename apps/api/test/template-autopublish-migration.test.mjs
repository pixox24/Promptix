import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../drizzle/0017_template_autopublish.sql', import.meta.url);

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
