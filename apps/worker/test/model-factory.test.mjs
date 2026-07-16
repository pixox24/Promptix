import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageModel, createLanguageModel } from '../dist/model-factory.js';
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

const baseProvider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Example',
  adapterType: 'openai_compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKeyEnv: 'TEST_MODEL_FACTORY_KEY',
  authStyle: 'bearer',
  enabled: true,
  protocol: 'openai_chat',
  kind: 'llm',
  defaultModel: 'example-model',
  defaults: {},
  isDefault: false,
};

const baseModel = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: baseProvider.id,
  name: 'Example model',
  modelId: 'example-model',
  capabilities: ['text', 'structured_output'],
  defaults: {},
  enabled: true,
  isDefaultText: true,
  isDefaultVision: false,
  isDefaultImage: false,
};

test('creates a dynamic OpenAI-compatible language model', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  const model = createLanguageModel({ provider: baseProvider, model: baseModel });
  assert.equal(model.modelId, 'example-model');
});

test('rejects language use for the custom async image adapter', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  assert.throws(
    () => createLanguageModel({
      provider: { ...baseProvider, adapterType: 'custom_65535_async' },
      model: baseModel,
    }),
    /does not provide language models/,
  );
});

test('rejects image use for Anthropic', () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'secret';
  assert.throws(
    () => createImageModel({
      provider: { ...baseProvider, adapterType: 'anthropic' },
      model: { ...baseModel, capabilities: ['image'] },
    }),
    /does not provide image models/,
  );
});
