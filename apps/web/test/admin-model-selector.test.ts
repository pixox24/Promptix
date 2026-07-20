import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared model selector separates selection from global default assignment', async () => {
  const selector = await readFile(new URL('../src/components/admin/ModelSelector.tsx', import.meta.url), 'utf8');
  const textFlow = await readFile(new URL('../src/components/admin/ingest/TextOptimizeFlow.tsx', import.meta.url), 'utf8');
  const imageFlow = await readFile(new URL('../src/components/admin/ingest/ImageReverseFlow.tsx', import.meta.url), 'utf8');

  assert.match(selector, /role === 'text' \? 'isDefaultText'/);
  assert.match(selector, /role === 'vision' \? 'isDefaultVision'/);
  assert.match(selector, /PATCH/);
  assert.match(selector, /await api<AdminModel\[]>\('\/api\/admin\/models'\)/);
  assert.match(selector, /星标会影响所有使用默认/);
  assert.match(textFlow, /find\(m=>m\.isDefaultText\)/);
  assert.match(textFlow, /<ModelSelector/);
  assert.match(imageFlow, /role="vision"/);
  assert.match(imageFlow, /role="text"/);
});
