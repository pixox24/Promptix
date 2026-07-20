import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle/0003_ingest_system_prompts.sql',
);

test('ingest prompt migration is additive and seeds both flows', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.match(migration, /CREATE TABLE "ingest_system_prompts"/);
  assert.match(migration, /CHECK \("(?:ingest_system_prompts"\.)?"flow_type" in \('text_expand', 'image_reverse'\)\)/i);
  assert.match(migration, /char_length\(btrim\("(?:ingest_system_prompts"\.)?"prompt"\)\) between 1 and 20000/i);
  assert.match(migration, /'text_expand'/);
  assert.match(migration, /'image_reverse'/);
  assert.match(migration, /ON CONFLICT \("flow_type"\) DO NOTHING/);
});
