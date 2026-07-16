import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRoleForJob,
  requiredCapabilitiesForJob,
  selectLegacyModelCandidate,
} from '../dist/lib/job-model-selection.js';

const candidate = (overrides = {}) => ({
  id: overrides.id ?? 'model',
  modelId: overrides.modelId ?? 'model-id',
  capabilities: overrides.capabilities ?? ['text', 'structured_output'],
  isDefaultText: overrides.isDefaultText ?? false,
  isDefaultVision: overrides.isDefaultVision ?? false,
  isDefaultImage: overrides.isDefaultImage ?? false,
});

test('derives model roles and required capabilities for every job type', () => {
  assert.equal(defaultRoleForJob('noop'), null);
  assert.equal(defaultRoleForJob('text_expand'), 'text');
  assert.equal(defaultRoleForJob('image_reverse'), 'text');
  assert.equal(defaultRoleForJob('image_generate'), 'image');
  assert.deepEqual(requiredCapabilitiesForJob('structure'), ['text', 'structured_output']);
  assert.deepEqual(requiredCapabilitiesForJob('image_generate'), ['image']);
});

test('legacy selection prefers old default, then role default, and filters capabilities', () => {
  const rows = [
    candidate({ id: 'wrong', modelId: 'new-image', capabilities: ['image'] }),
    candidate({ id: 'role', modelId: 'new-text', isDefaultText: true }),
    candidate({ id: 'legacy', modelId: 'old-text' }),
  ];
  assert.equal(selectLegacyModelCandidate(rows, 'text_expand', 'old-text')?.id, 'legacy');
  assert.equal(selectLegacyModelCandidate(rows, 'text_expand', '')?.id, 'role');
  assert.equal(selectLegacyModelCandidate(rows, 'image_generate', '')?.id, 'wrong');
});
