import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle/0002_ai_sdk_model_registry.sql',
);

const migration = readFileSync(migrationPath, 'utf8');

test('model registry migration is additive and preserves compatibility columns', () => {
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);

  assert.match(migration, /CREATE TABLE "provider_models"/);
  assert.match(migration, /ALTER TABLE "generation_jobs" ADD COLUMN "model_id" uuid/);
  assert.doesNotMatch(migration, /DROP COLUMN "provider_id"/i);
  assert.doesNotMatch(migration, /DROP COLUMN "default_model"/i);
});

test('model registry migration backfills every provider and legacy provider job', () => {
  assert.match(migration, /INSERT INTO "provider_models"/);
  assert.match(migration, /FROM "providers" p/);
  assert.match(migration, /UPDATE "generation_jobs" gj\s+SET "model_id" = pm\."id"/);
  assert.match(migration, /gj\."provider_id" = pm\."provider_id"/);

  assert.match(migration, /WHEN 'deepseek_chat' THEN 'deepseek'/);
  assert.match(migration, /WHEN 'openai_images_async' THEN 'custom_65535_async'/);
});

test('default model uniqueness is created only after data backfill', () => {
  const backfillAt = migration.indexOf('INSERT INTO "provider_models"');
  const defaultsAt = migration.indexOf('SET "is_default_text" = true');
  const indexesAt = migration.indexOf('CREATE UNIQUE INDEX "provider_models_default_text_uidx"');

  assert.ok(backfillAt >= 0 && defaultsAt > backfillAt);
  assert.ok(indexesAt > defaultsAt);
  assert.match(migration, /provider_models_default_vision_uidx/);
  assert.match(migration, /provider_models_default_image_uidx/);
});
