import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('image reverse pipeline migration adds dual-model and bounded diagnostics columns', async () => {
  const sql = await readFile(new URL('../drizzle/0008_image_reverse_pipeline.sql', import.meta.url), 'utf8');
  for (const column of ['vision_model_id', 'error_code', 'error_details', 'progress', 'result_meta']) assert.match(sql, new RegExp(column));
  assert.match(sql, /REFERENCES "public"\."provider_models"/);
  assert.match(sql, /STRUCTURE_JSON_INVALID/);
});

test('JSON prompt migration preserves administrator-edited prompts', async () => {
  const sql = await readFile(new URL('../drizzle/0007_ingest_json_prompts.sql', import.meta.url), 'utf8');
  assert.match(sql, /JSON\.parse/);
  assert.match(sql, /"updated_by" IS NULL/);
  assert.match(sql, /NOT ILIKE '%JSON%'/);
});
