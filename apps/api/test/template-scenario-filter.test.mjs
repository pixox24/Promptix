import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public template API filters scenarios against the scenarios column', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');

  assert.match(source, /c\.req\.query\('scenario'\)/);
  assert.match(source, /\$\{scenario\} = ANY\(\$\{promptTemplates\.scenarios\}\)/);
});
