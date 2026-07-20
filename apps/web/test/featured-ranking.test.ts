import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compareTemplates } from '../src/lib/templateRanking';
import type { PromptTemplate } from '../src/types/prompt';

function template(id: string, useCount: number, isFeatured = false, featuredOrder = 0): PromptTemplate {
  return {
    id, name: id, summary: '', description: '', coverImage: '', category: 'illustration',
    tags: [], variables: [], promptTemplate: '', scenarios: [], isFeatured, featuredOrder,
    favoriteCount: 0, useCount, createdAt: '2026-01-01T00:00:00.000Z',
  };
}

test('places featured between hot and favorites in the sort controls', async () => {
  const source = await readFile(new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url), 'utf8');
  const hot = source.indexOf("id: 'hot'");
  const featured = source.indexOf("id: 'featured'");
  const favorites = source.indexOf("id: 'favorites'");
  assert.ok(hot < featured && featured < favorites);
});

test('orders featured manually, then fills with unique hot templates', () => {
  const items = [
    template('popular', 100),
    template('featured-later', 5, true, 20),
    template('featured-first', 1, true, 10),
    template('runner-up', 50),
  ];
  const ranked = [...items].sort(compareTemplates('featured'));
  assert.deepEqual(ranked.map((item) => item.id), [
    'featured-first', 'featured-later', 'popular', 'runner-up',
  ]);
  assert.equal(new Set(ranked.map((item) => item.id)).size, ranked.length);
});

test('falls back exactly to hot order when no templates are featured', () => {
  const items = [template('low', 1), template('high', 100), template('middle', 50)];
  assert.deepEqual(
    [...items].sort(compareTemplates('featured')).map((item) => item.id),
    [...items].sort(compareTemplates('hot')).map((item) => item.id),
  );
});
