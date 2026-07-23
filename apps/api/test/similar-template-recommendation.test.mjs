import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSimilarTemplateService } from '../dist/services/similar-template-service.js';

function template(id, overrides = {}) {
  return {
    id,
    name: id,
    summary: '',
    description: '',
    coverImage: '',
    category: 'portrait',
    tags: ['portrait'],
    semantic: {
      workflowType: 'generate',
      outputType: 'portrait',
      scenarios: [],
      styles: [],
      subjects: [],
      tags: ['portrait'],
      unmappedTerms: [],
      confidence: {},
    },
    variables: [],
    promptTemplate: 'portrait',
    scenarios: [],
    favoriteCount: 0,
    useCount: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    locale: 'zh',
    ...overrides,
  };
}

test('similar template service ranks candidates and persists the exact response snapshot', async () => {
  const persisted = [];
  const service = createSimilarTemplateService({
    findSource: async () => template('source'),
    findCandidates: async () => [
      template('candidate-b', { useCount: 20 }),
      template('candidate-a', { useCount: 10 }),
    ],
    loadFeedback: async () => new Map(),
    persistRequest: async (input) => {
      persisted.push(input);
      return '1c67bb3f-5b67-4115-9c20-d60830e3d117';
    },
  }, () => new Date('2026-07-23T00:00:00.000Z'));

  const response = await service('source', 1);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].template.id, 'candidate-b');
  assert.equal(response.items[0].position, 1);
  assert.deepEqual(persisted[0].candidateIds, ['candidate-b']);
  assert.equal(persisted[0].scoreSnapshot[0].position, 1);
  assert.equal(response.algorithmVersion, 'similar-v1');
});

test('similar template service returns null when the source is unavailable', async () => {
  const service = createSimilarTemplateService({
    findSource: async () => null,
    findCandidates: async () => {
      throw new Error('should not load candidates');
    },
    loadFeedback: async () => new Map(),
    persistRequest: async () => crypto.randomUUID(),
  });

  assert.equal(await service('missing', 4), null);
});

test('similar route is registered before the generic template detail route', async () => {
  const source = await readFile(
    new URL('../src/routes/templates.ts', import.meta.url),
    'utf8',
  );
  const similarIndex = source.indexOf("publicTemplateRoutes.get('/:id/similar'");
  const detailIndex = source.indexOf("publicTemplateRoutes.get('/:id'");

  assert.ok(similarIndex >= 0);
  assert.ok(similarIndex < detailIndex);
  assert.match(source, /limit must be an integer between 1 and 12/);
});
