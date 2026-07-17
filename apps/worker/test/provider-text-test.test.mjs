import test from 'node:test';
import assert from 'node:assert/strict';
import { runProviderTextTest } from '../dist/provider-text-test.js';

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
  defaultModel: '',
  defaults: {},
  isDefault: false,
};

const baseModel = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: baseProvider.id,
  name: 'Example model',
  modelId: 'example-model',
  capabilities: ['text'],
  defaults: {},
  enabled: true,
  isDefaultText: true,
  isDefaultVision: false,
  isDefaultImage: false,
};

const config = { provider: baseProvider, model: baseModel };

test('uses a fixed minimal text request and stores no generated text', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  let request;
  let calls = 0;
  const output = await runProviderTextTest(
    config,
    async (value) => {
      calls += 1;
      request = value;
      return { text: 'OK' };
    },
  );

  assert.equal(calls, 1);
  assert.equal(request.prompt, 'Reply with OK only');
  assert.equal(request.temperature, 0);
  assert.equal(request.maxOutputTokens, 16);
  assert.equal(request.maxRetries, 0);
  assert.deepEqual(Object.keys(output).sort(), [
    'checkedAt', 'latencyMs', 'modelId', 'ok', 'providerId',
  ]);
});

test('redacts authentication material in an upstream failure', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  await assert.rejects(
    () => runProviderTextTest(config, async () => {
      throw new Error('401 Authorization: Bearer secret-token');
    }),
    (error) => error.message.includes('authentication failed') &&
      !error.message.includes('secret-token'),
  );
});

test('maps an unavailable endpoint or model to a safe error', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  await assert.rejects(
    () => runProviderTextTest(config, async () => {
      throw new Error('404 model endpoint missing');
    }),
    (error) => error.message === 'Provider endpoint or model was not found',
  );
});

test('maps an upstream rate limit to a safe error', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  await assert.rejects(
    () => runProviderTextTest(config, async () => {
      throw new Error('429 request quota exhausted');
    }),
    (error) => error.message === 'Provider rate limit reached',
  );
});

test('maps network failures to a safe error', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  await assert.rejects(
    () => runProviderTextTest(config, async () => {
      throw new Error('ECONNREFUSED https://example.invalid/v1');
    }),
    (error) => error.message === 'Provider request timed out or could not reach the endpoint',
  );
});

test('redacts unknown-error credentials and limits their stored length', async () => {
  process.env.TEST_MODEL_FACTORY_KEY = 'test-secret';
  const secret = 'secret-token';
  const upstreamMessage = `unexpected Authorization: Bearer ${secret}; X-API-Key: ${secret}; {"api_key":"${secret}","apiKey":"${secret}"} ${'x'.repeat(300)}`;
  await assert.rejects(
    () => runProviderTextTest(config, async () => {
      throw new Error(upstreamMessage);
    }),
    (error) => error.message.startsWith('Provider test failed: ') &&
      error.message.length <= 'Provider test failed: '.length + 240 &&
      !error.message.includes(secret),
  );
});
