import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const homePagePath = new URL('../src/pages/HomePage.tsx', import.meta.url);
const sidebarPath = new URL(
  '../src/components/browse/FilterSidebar.tsx',
  import.meta.url,
);

test('desktop filter sidebar aligns with the template grid', async () => {
  const source = await readFile(sidebarPath, 'utf8');

  assert.match(source, /sticky top-\[4\.5rem\]/);
  assert.match(source, /h-\[calc\(100vh-6rem\)\]/);
  assert.doesNotMatch(source, /sticky top-24/);
});

test('local filter and sort changes do not re-enter the loading state', async () => {
  const source = await readFile(homePagePath, 'utf8');

  assert.match(source, /className="min-w-0 flex-1 \[overflow-anchor:none\]"/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => setLoading\(false\), 120\)/);
  assert.doesNotMatch(
    source,
    /\[query, sort, tagsParam, templates\.length\]/,
  );
});
