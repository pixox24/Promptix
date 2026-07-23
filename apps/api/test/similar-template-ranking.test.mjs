import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSimilarTemplates } from '../dist/lib/similar-template-ranking.js';

function template(overrides) {
  return {
    id: 'source',
    name: 'Source',
    summary: '',
    description: '',
    coverImage: '',
    category: 'portrait',
    tags: [],
    semantic: {
      workflowType: 'generate',
      outputType: 'portrait',
      scenarios: [],
      styles: [],
      subjects: [],
      tags: [],
      unmappedTerms: [],
      confidence: {},
    },
    variables: [],
    promptTemplate: 'portrait',
    scenarios: [],
    favoriteCount: 0,
    useCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    locale: 'zh',
    ...overrides,
  };
}

test('content relevance dominates behavioral feedback and filters weak candidates', () => {
  const source = template({
    tags: ['cinematic', 'studio'],
    semantic: {
      workflowType: 'generate',
      outputType: 'portrait',
      scenarios: ['social_media'],
      styles: ['cinematic'],
      subjects: ['person'],
      tags: ['cinematic', 'studio'],
      unmappedTerms: [],
      confidence: {},
    },
  });
  const highContent = template({
    id: 'high',
    category: 'illustration',
    tags: ['cinematic'],
    semantic: {
      ...source.semantic,
      scenarios: [],
      tags: ['cinematic'],
    },
  });
  const lowContentHighClicks = template({
    id: 'low',
    category: 'poster',
    tags: ['unrelated'],
    semantic: {
      ...source.semantic,
      outputType: 'poster',
      scenarios: [],
      styles: [],
      subjects: [],
      tags: ['unrelated'],
    },
  });

  const ranked = rankSimilarTemplates({
    source,
    candidates: [lowContentHighClicks, highContent],
    feedback: new Map([
      ['low', { impressions: 100, clicks: 90, successes: 80 }],
    ]),
    now: new Date('2026-07-23T00:00:00.000Z'),
    limit: 4,
  });

  assert.equal(ranked[0].template.id, 'high');
  assert.ok(ranked.every((item) => item.contentScore >= 25));
  assert.equal(ranked.some((item) => item.template.id === 'low'), false);
  assert.match(ranked[0].reasonLabel, /同类产出/);
  assert.doesNotMatch(ranked[0].reasonLabel, /portrait|cinematic/);
});

test('ranking is stable for equal scores', () => {
  const source = template({});
  const older = template({ id: 'older', useCount: 10, createdAt: '2025-01-01T00:00:00.000Z' });
  const newer = template({ id: 'newer', useCount: 10, createdAt: '2026-01-01T00:00:00.000Z' });

  const ranked = rankSimilarTemplates({
    source,
    candidates: [older, newer],
    feedback: new Map(),
    now: new Date('2026-07-23T00:00:00.000Z'),
    limit: 4,
  });

  assert.deepEqual(ranked.map((item) => item.template.id), ['newer', 'older']);
});
