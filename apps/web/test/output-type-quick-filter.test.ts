import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public output types render as single-select quick filter tags', async () => {
  const source = await readFile(new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url), 'utf8');

  assert.equal((source.match(/<SectionTitle>快捷筛选<\/SectionTitle>/g) ?? []).length, 2);
  assert.equal((source.match(/termsFor\('output_type'\)/g) ?? []).length, 2);
  assert.match(source, /selected=\{outputType \? \[outputType\] : \[\]\}/);
  assert.match(source, /outputType === slug \? '' : slug/);
  assert.doesNotMatch(source, /<SectionTitle>产物类型<\/SectionTitle>/);
  assert.doesNotMatch(source, /<select value=\{outputType\}/);
});
