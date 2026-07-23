import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('taxonomy migration is additive and seeds extensible wallpaper semantics', async () => {
  const migration = await readFile(new URL('../drizzle/0009_happy_whistler.sql', import.meta.url), 'utf8');

  assert.match(migration, /CREATE TABLE "taxonomy_terms"/);
  assert.match(migration, /CREATE TABLE "template_taxonomy_assignments"/);
  assert.match(migration, /'output_type','wallpaper'/);
  assert.match(migration, /'scenario','mobile_wallpaper'/);
  assert.match(migration, /'subject','nature_landscape'/);
  assert.match(migration, /ON CONFLICT \("dimension", "slug"\) DO NOTHING/);
  assert.match(migration, /WHEN 'edit' THEN 'general_visual'/);
  assert.doesNotMatch(migration, /DROP (?:TABLE|COLUMN)/i);
});

test('new templates are drafts and publishing has server-side taxonomy gates', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /status\s*:\s*d\.status/);
  assert.match(source, /taxonomyReviewStatus:reviewStatus/);
  assert.match(source, /TAXONOMY_REVIEW_REQUIRED/);
  assert.match(source, /TAXONOMY_TERM_DISABLED/);
  assert.match(source, /assertConfirmableSemantic\(semantic\)/);
  assert.match(source, /const templatePatchInput = templateDraftSchema\.partial\(\)\.extend/);
});

test('admins can deterministically confirm the current taxonomy before publishing', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');

  assert.match(source, /post\('\/:id\/taxonomy-confirm'/);
  assert.match(source, /eventType,\s*'template\.taxonomy_confirmed'/);
  assert.match(source, /taxonomyReviewStatus:\s*'reviewed'/);
  assert.match(source, /taxonomyReviewedBy:\s*c\.get\('admin'\)\.sub/);
  assert.match(source, /assertConfirmableSemantic\(semantic\)/);
  assert.match(source, /loadTemplateSemanticViews\(\[existing\]\)/);
  assert.doesNotMatch(source, /\bsemanticViews\(/);
  assert.match(source, /updateTemplateWithVersion/);
});

test('both ingest routes freeze taxonomy snapshots into job input', async () => {
  const source = await readFile(new URL('../src/routes/jobs.ts', import.meta.url), 'utf8');

  assert.match(source, /loadActiveTaxonomySnapshot/);
  assert.ok((source.match(/taxonomySnapshot:/g) ?? []).length >= 3);
  assert.ok((source.match(/taxonomySnapshotHash:/g) ?? []).length >= 3);
});
