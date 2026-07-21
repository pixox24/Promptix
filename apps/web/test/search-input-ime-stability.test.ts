import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stableInputSource = readFileSync(
  new URL('../src/components/browse/StableSearchInput.tsx', import.meta.url),
  'utf8',
);
const sidebarSource = readFileSync(
  new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url),
  'utf8',
);

test('search input keeps an independent draft and debounces committed queries', () => {
  assert.match(stableInputSource, /useState\(query\)/);
  assert.match(stableInputSource, /window\.setTimeout/);
  assert.match(stableInputSource, /300/);
  assert.match(stableInputSource, /draftQuery === query/);
});

test('search input protects IME composition from URL synchronization', () => {
  assert.match(stableInputSource, /onCompositionStart/);
  assert.match(stableInputSource, /onCompositionEnd/);
  assert.match(stableInputSource, /isComposingRef\.current/);
  assert.match(stableInputSource, /if \(isComposing\) return/);
});

test('desktop and mobile search use the same stable input component', () => {
  assert.match(sidebarSource, /import \{ StableSearchInput \}/);
  assert.equal(sidebarSource.match(/<StableSearchInput/g)?.length, 2);
  assert.doesNotMatch(sidebarSource, /onChange=\{\(e\) => onQueryChange\(e\.target\.value\)\}/);
});
