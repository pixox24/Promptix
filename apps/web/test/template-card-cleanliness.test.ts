import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardPath = new URL(
  '../src/components/template/TemplateCard.tsx',
  import.meta.url,
);

test('keeps output-type labels off template cover images', async () => {
  const source = await readFile(cardPath, 'utf8');

  assert.doesNotMatch(source, /template\.outputTypeLabel/);
  assert.match(source, /\{template\.name\}/);
  assert.match(source, /template\.tags\.map/);
});
