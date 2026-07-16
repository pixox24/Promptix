import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCapabilitiesForJob,
  imageReverseNeedsVisionFallback,
  roleForJob,
  selectLegacyModel,
} from '../dist/model-routing.js';

const model = (overrides = {}) => ({
  id: overrides.id ?? 'model',
  name: overrides.name ?? 'Test model',
  modelId: overrides.modelId ?? 'test-model',
  capabilities: overrides.capabilities ?? ['text', 'structured_output'],
  isDefaultText: overrides.isDefaultText ?? false,
  isDefaultVision: overrides.isDefaultVision ?? false,
  isDefaultImage: overrides.isDefaultImage ?? false,
});

test('maps job types to default model roles', () => {
  assert.equal(roleForJob('text_expand'), 'text');
  assert.equal(roleForJob('structure'), 'text');
  assert.equal(roleForJob('image_reverse'), 'text');
  assert.equal(roleForJob('image_generate'), 'image');
  assert.equal(roleForJob('noop'), null);
});

test('requires the complete capability set for each job type', () => {
  assert.throws(
    () => assertCapabilitiesForJob(model({ capabilities: ['text'] }), 'text_expand'),
    /structured_output/,
  );
  assert.doesNotThrow(() => assertCapabilitiesForJob(model(), 'text_expand'));
  assert.throws(
    () => assertCapabilitiesForJob(model({ capabilities: ['text'] }), 'image_generate'),
    /image capability/,
  );
});

test('image reverse only needs fallback when primary model lacks vision', () => {
  assert.equal(imageReverseNeedsVisionFallback(model({
    capabilities: ['text', 'structured_output', 'vision'],
  })), false);
  assert.equal(imageReverseNeedsVisionFallback(model()), true);
});

test('legacy provider selection prefers its migrated default model', () => {
  const candidates = [
    model({ id: 'newer', modelId: 'newer-text', isDefaultText: true }),
    model({ id: 'legacy', modelId: 'legacy-text' }),
  ];
  assert.equal(selectLegacyModel(candidates, 'text_expand', 'legacy-text')?.id, 'legacy');
});

test('legacy provider selection ignores newer models with the wrong capability', () => {
  const candidates = [
    model({ id: 'image', modelId: 'image-only', capabilities: ['image'], isDefaultImage: true }),
    model({ id: 'text', modelId: 'text-model', isDefaultText: true }),
  ];
  assert.equal(selectLegacyModel(candidates, 'text_expand', '')?.id, 'text');
  assert.equal(selectLegacyModel(candidates, 'image_generate', '')?.id, 'image');
});
