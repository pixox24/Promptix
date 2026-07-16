import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDefaultRole,
  modelIdentityChangeError,
} from '../dist/lib/model-policy.js';

test('detects models that hold any default role', () => {
  assert.equal(hasDefaultRole({
    isDefaultText: false,
    isDefaultVision: true,
    isDefaultImage: false,
  }), true);
  assert.equal(hasDefaultRole({
    isDefaultText: false,
    isDefaultVision: false,
    isDefaultImage: false,
  }), false);
});

test('provider ownership and vendor model ID are immutable', () => {
  const existing = { providerId: 'provider-a', modelId: 'model-a' };
  assert.match(
    modelIdentityChangeError(existing, { providerId: 'provider-b' }),
    /Provider ownership/,
  );
  assert.match(
    modelIdentityChangeError(existing, { modelId: 'model-b' }),
    /vendor model ID/,
  );
  assert.equal(modelIdentityChangeError(existing, { providerId: 'provider-a' }), null);
  assert.equal(modelIdentityChangeError(existing, { name: 'Renamed' }), null);
});
