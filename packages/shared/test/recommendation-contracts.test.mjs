import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recommendationContextSchema,
  recommendationEventInputSchema,
  similarTemplateResponseSchema,
} from '../dist/index.js';

test('recommendation contracts accept attribution and reject untrusted ranking fields', () => {
  const requestId = crypto.randomUUID();

  assert.equal(recommendationEventInputSchema.safeParse({
    requestId,
    eventType: 'click',
    recommendedTemplateId: 'tpl-b',
    position: 99,
  }).success, false);
  assert.equal(recommendationContextSchema.safeParse({
    recommendationRequestId: requestId,
  }).success, true);
  assert.equal(
    similarTemplateResponseSchema.shape.algorithmVersion.parse('similar-v1'),
    'similar-v1',
  );
});

