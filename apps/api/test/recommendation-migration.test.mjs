import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../drizzle/0016_similar_template_recommendation_loop.sql', import.meta.url);

test('recommendation migration persists request snapshots and constrained events', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table "template_recommendation_requests"/i);
  assert.match(sql, /create table "template_recommendation_events"/i);
  assert.match(sql, /foreign key.*source_template_id.*prompt_templates/is);
  assert.match(sql, /foreign key.*request_id.*template_recommendation_requests/is);
  assert.match(sql, /foreign key.*generation_job_id.*generation_jobs/is);
  assert.match(sql, /impression.*click.*generation_succeeded/is);
  assert.match(sql, /position.*between 1 and 12/is);
  assert.match(sql, /dedupe_key.*unique/is);
  assert.match(sql, /template_recommendation_events_pair_type_created_idx/i);
  assert.match(sql, /template_recommendation_requests_expires_idx/i);
});

