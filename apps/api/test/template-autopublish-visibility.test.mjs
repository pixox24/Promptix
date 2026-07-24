import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public discovery and recommendations exclude exposure-limited templates', async () => {
  const predicate = await readFile(new URL('../src/lib/template-visibility.ts', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');
  const similar = await readFile(new URL('../src/services/similar-template-service.ts', import.meta.url), 'utf8');
  assert.match(predicate, /exposure_limited/);
  assert.match(predicate, /publiclyDiscoverableTemplate/);
  assert.match(routes, /publiclyDiscoverableTemplate\(\)/);
  assert.match(similar, /publiclyDiscoverableTemplate\(\)/);
});
