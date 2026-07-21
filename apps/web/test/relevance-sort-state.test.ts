import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  browseParamsWithQuery,
  browseParamsWithSort,
  deriveBrowseState,
} from '../src/lib/templateBrowseState';

test('uses hot without a query and relevance with a trimmed query', () => {
  assert.deepEqual(deriveBrowseState(new URLSearchParams()), {
    query: '', normalizedQuery: '', hasQuery: false, sort: 'hot', needsCanonicalSort: false,
  });
  assert.deepEqual(deriveBrowseState(new URLSearchParams({ q: '  雪山 壁纸  ' })), {
    query: '  雪山 壁纸  ', normalizedQuery: '雪山 壁纸', hasQuery: true, sort: 'relevance', needsCanonicalSort: false,
  });
  assert.equal(deriveBrowseState(new URLSearchParams({ q: '   ' })).hasQuery, false);
});

test('normalizes relevance without a query back to hot', () => {
  const state = deriveBrowseState(new URLSearchParams({ sort: 'relevance' }));
  assert.equal(state.sort, 'hot');
  assert.equal(state.needsCanonicalSort, true);
});

test('starting a search chooses relevance but continued typing preserves an explicit sort', () => {
  const started = browseParamsWithQuery(new URLSearchParams({ sort: 'latest', page: '3' }), '雪山');
  assert.equal(started.get('q'), '雪山');
  assert.equal(started.has('sort'), false);
  assert.equal(started.has('page'), false);

  const continued = browseParamsWithQuery(new URLSearchParams({ q: '雪山', sort: 'latest' }), '雪山 壁纸');
  assert.equal(continued.get('sort'), 'latest');
});

test('clearing a relevance search restores hot while other explicit sorts remain', () => {
  const relevanceCleared = browseParamsWithQuery(new URLSearchParams({ q: '雪山' }), '   ');
  assert.equal(relevanceCleared.has('q'), false);
  assert.equal(relevanceCleared.has('sort'), false);
  assert.equal(deriveBrowseState(relevanceCleared).sort, 'hot');

  const latestCleared = browseParamsWithQuery(new URLSearchParams({ q: '雪山', sort: 'latest' }), '');
  assert.equal(latestCleared.get('sort'), 'latest');
});

test('stores only non-default sorts and rejects relevance as an empty-search state', () => {
  assert.equal(browseParamsWithSort(new URLSearchParams({ q: '雪山' }), 'relevance').has('sort'), false);
  assert.equal(browseParamsWithSort(new URLSearchParams(), 'hot').has('sort'), false);
  assert.equal(browseParamsWithSort(new URLSearchParams(), 'relevance').has('sort'), false);
  assert.equal(browseParamsWithSort(new URLSearchParams({ q: '雪山' }), 'latest').get('sort'), 'latest');
});

test('shows 最相关 only when a real query exists on desktop and mobile', async () => {
  const source = await readFile(new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url), 'utf8');
  assert.match(source, /label: '最相关'/);
  assert.match(source, /visibleSortItems\(hasQuery\)/);
  assert.match(source, /hasQuery: boolean/);
  assert.doesNotMatch(source, /label: '相关'/);
});

test('homepage and library delegate query and sort transitions to the browse hook', async () => {
  for (const page of ['HomePage.tsx', 'LibraryPage.tsx']) {
    const source = await readFile(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
    assert.match(source, /onQueryChange: browse\.setQuery/);
    assert.match(source, /onSortChange: browse\.setSort/);
    assert.match(source, /hasQuery: browse\.hasQuery/);
    assert.doesNotMatch(source, /sort === \(browse\.query \? 'relevance' : 'hot'\)/);
  }
});
