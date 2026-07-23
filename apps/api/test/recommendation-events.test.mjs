import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecommendationEventService } from '../dist/services/recommendation-event-service.js';

const requestId = 'c96d77db-f956-45da-af7c-0ad621397c7e';
const request = {
  id: requestId,
  sourceTemplateId: 'source',
  algorithmVersion: 'similar-v1',
  candidateIds: ['candidate'],
  scoreSnapshot: [{ templateId: 'candidate', position: 2 }],
  createdAt: new Date('2026-07-23T00:00:00.000Z'),
  expiresAt: new Date('2026-07-23T04:00:00.000Z'),
};

test('event service derives ranking fields and is idempotent', async () => {
  const inserted = [];
  const service = createRecommendationEventService({
    findRequest: async () => request,
    insertEvent: async (event) => {
      if (inserted.some((item) => item.dedupeKey === event.dedupeKey)) return false;
      inserted.push(event);
      return true;
    },
  }, () => new Date('2026-07-23T01:00:00.000Z'));
  const input = {
    sourceTemplateId: 'source',
    requestId,
    eventType: 'impression',
    recommendedTemplateId: 'candidate',
  };

  assert.deepEqual(await service(input), { ok: true, recorded: true });
  assert.deepEqual(await service(input), { ok: true, recorded: false });
  assert.equal(inserted[0].position, 2);
  assert.equal(inserted[0].dedupeKey, `impression:${requestId}:candidate`);
});

test('event service rejects mismatched, unknown, and expired requests', async () => {
  const service = createRecommendationEventService({
    findRequest: async () => request,
    insertEvent: async () => {
      throw new Error('should not insert');
    },
  }, () => new Date('2026-07-23T05:00:00.000Z'));

  assert.equal((await service({
    sourceTemplateId: 'other',
    requestId,
    eventType: 'click',
    recommendedTemplateId: 'candidate',
  })).ok, false);
  assert.equal((await service({
    sourceTemplateId: 'source',
    requestId,
    eventType: 'click',
    recommendedTemplateId: 'unknown',
  })).ok, false);
  assert.equal((await service({
    sourceTemplateId: 'source',
    requestId,
    eventType: 'click',
    recommendedTemplateId: 'candidate',
  })).ok, false);
});
