import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public generation migration adds private ownership and exactly-once usage fields', async () => {
  const sql=await readFile(new URL('../drizzle/0004_public_generations.sql',import.meta.url),'utf8');
  assert.match(sql,/owner_key_hash/);assert.match(sql,/usage_recorded_at/);assert.match(sql,/generation_jobs_owner_status_idx/);
});

test('public generation creation validates and stores recommendation attribution', async () => {
  const source = await readFile(
    new URL('../src/routes/generations.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /recommendationRequestId/);
  assert.match(source, /RECOMMENDATION_REQUEST_INVALID/);
  assert.match(source, /templateRecommendationRequests/);
  assert.match(source, /expiresAt/);
});
