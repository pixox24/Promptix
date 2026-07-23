import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createRecommendationAttributionService,
  recordRecommendationGenerationSuccessSafely,
} from '../dist/recommendation-attribution.js';

const requestId = 'ce333433-1418-4a41-b2fd-9c464969bd45';
const request = {
  id: requestId,
  sourceTemplateId: 'source',
  candidateIds: ['target'],
  scoreSnapshot: [{ templateId: 'target', position: 3 }],
};

test('generation attribution records a server-derived success once', async () => {
  const events = [];
  const service = createRecommendationAttributionService({
    findRequest: async () => request,
    insertSuccess: async (event) => {
      if (events.some((item) => item.dedupeKey === event.dedupeKey)) return false;
      events.push(event);
      return true;
    },
  });
  const input = {
    jobId: '00cb0732-2bd5-4c54-9c03-1aa06f90d45f',
    templateId: 'target',
    recommendationRequestId: requestId,
  };

  assert.equal(await service(input), true);
  assert.equal(await service(input), false);
  assert.equal(events[0].sourceTemplateId, 'source');
  assert.equal(events[0].position, 3);
  assert.equal(events[0].dedupeKey, `generation:${input.jobId}`);
});

test('generation attribution ignores missing and mismatched contexts', async () => {
  const service = createRecommendationAttributionService({
    findRequest: async () => request,
    insertSuccess: async () => {
      throw new Error('should not insert');
    },
  });

  assert.equal(await service({
    jobId: crypto.randomUUID(),
    templateId: 'target',
  }), false);
  assert.equal(await service({
    jobId: crypto.randomUUID(),
    templateId: 'other',
    recommendationRequestId: requestId,
  }), false);
});

test('attribution storage failures never fail the generation workflow', async () => {
  const errors = [];
  const recorded = await recordRecommendationGenerationSuccessSafely(
    {
      jobId: crypto.randomUUID(),
      templateId: 'target',
      recommendationRequestId: requestId,
    },
    async () => {
      throw new Error('database unavailable');
    },
    (error) => errors.push(error),
  );

  assert.equal(recorded, false);
  assert.equal(errors.length, 1);
});

test('worker retries attribution even when usage was already counted', async () => {
  const source = await readFile(
    new URL('../src/generated-media.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /if\s*\(recorded\.length\)\s*\{[\s\S]*useCount[\s\S]*\}\s*await recordRecommendationGenerationSuccessSafely/,
  );
});
