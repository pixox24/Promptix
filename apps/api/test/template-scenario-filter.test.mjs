import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public template API filters the semantic taxonomy before pagination', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');

  assert.match(source, /c\.req\.query\('scenarios'\) \?\? c\.req\.query\('scenario'\)/);
  assert.match(source, /taxonomyExists\('scenario', scenarios\)/);
  assert.match(source, /taxonomyExists\('style', styles\)/);
  assert.match(source, /taxonomyExists\('subject', subjects\)/);
  assert.match(source, /taxonomyTerms\.slug} in/);
  assert.match(source, /count\(\*\)::int/);
  assert.match(source, /\.where\(where\)\.orderBy\(\.\.\.order\)\s*\n\s*\.limit\(pageSize\)\.offset/);
  assert.match(source, /INVALID_CATEGORY/);
  assert.match(source, /requestedPage < 1/);
  assert.match(source, /requestedPageSize > 100/);
});
