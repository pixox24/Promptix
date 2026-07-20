import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('featured rank migration is additive and indexed', async () => {
  const migration = await readFile(new URL('../drizzle/0006_featured_template_rank.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN "featured_order" integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /prompt_templates_featured_rank_idx/);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
});

test('public API uses one stable featured-first hot-fill ordering', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');
  const featuredBranch = source.slice(source.indexOf("sort === 'featured'"), source.indexOf("sort === 'latest'"));
  assert.match(featuredBranch, /isFeatured/);
  assert.match(featuredBranch, /featuredOrder/);
  assert.match(featuredBranch, /useCount/);
  assert.match(featuredBranch, /createdAt/);
  assert.match(featuredBranch, /promptTemplates\.id/);
});

test('admin API accepts and filters manual featured state', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');
  assert.match(source, /featuredOrder: z\.number\(\)\.int\(\)\.min\(0\)\.max\(1_000_000\)/);
  assert.match(source, /c\.req\.query\('featured'\)/);
  assert.match(source, /eq\(promptTemplates\.isFeatured, featured === 'true'\)/);
});
