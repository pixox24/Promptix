import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelDefaults, readProviderKey } from '../dist/model-defaults.js';

test('normalizes legacy DeepSeek defaults without leaking capability metadata', () => {
  const result = normalizeModelDefaults('deepseek', {
    supportsVision: false,
    temperature: 0.4,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
  });
  assert.equal(result.language.temperature, 0.4);
  assert.equal(result.language.maxOutputTokens, 4096);
  assert.deepEqual(result.language.providerOptions, {
    deepseek: { thinking: { type: 'disabled' } },
  });
  assert.equal('supportsVision' in result.language, false);
});

test('normalizes legacy async image defaults', () => {
  const result = normalizeModelDefaults('custom_65535_async', {
    size: '2048x2048',
    quality: 'high',
    response_format: 'url',
    asyncPollIntervalMs: 2000,
    asyncTimeoutMs: 900000,
    maxQueueSeconds: 120,
  });
  assert.deepEqual(result.image, { size: '2048x2048' });
  assert.deepEqual(result.async, {
    pollIntervalMs: 2000,
    timeoutMs: 900000,
    maxQueueSeconds: 120,
    quality: 'high',
    responseFormat: 'url',
  });
});

test('provider key lookup never returns an unset secret', () => {
  delete process.env.MISSING_PROVIDER_KEY;
  assert.throws(
    () => readProviderKey({ apiKeyEnv: 'MISSING_PROVIDER_KEY' }),
    /MISSING_PROVIDER_KEY is not set/,
  );
});
