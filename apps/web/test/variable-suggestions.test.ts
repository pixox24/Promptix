import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('../src/components/detail/VariableWorkbench.tsx', import.meta.url);
const reviewUrl = new URL('../src/components/admin/ingest/TemplateDraftReview.tsx', import.meta.url);

test('detail workbench prioritizes suggestions and preserves legacy text options', async () => {
  const source = await readFile(componentUrl, 'utf8');
  assert.match(source, /variable\.suggestions\?\.length/);
  assert.match(source, /variable\.type === 'text' \? options/);
  assert.match(source, /onChange\(variable\.key,option\)/);
  assert.match(source, /values\[variable\.key\] === option/);
});

test('detail suggestion tags wrap and remain fully visible', async () => {
  const source = await readFile(componentUrl, 'utf8');
  const suggestionRail = source.match(/suggestions\.length > 0[\s\S]*?<\/div>/)?.[0] ?? '';

  assert.match(suggestionRail, /flex flex-wrap gap-1\.5/);
  assert.match(suggestionRail, /aria-pressed=/);
  assert.doesNotMatch(suggestionRail, /overflow-x-auto/);
  assert.doesNotMatch(suggestionRail, /shrink-0/);
});

test('admin review edits strict options and free-input suggestions separately', async () => {
  const source = await readFile(reviewUrl, 'utf8');
  assert.match(source, /严格选项（select \/ ratio/);
  assert.match(source, /推荐值（text \/ number/);
  assert.match(source, /options: splitValues/);
  assert.match(source, /suggestions: splitValues/);
});
