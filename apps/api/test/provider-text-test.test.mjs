import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerTextTestProblem,
  providerTextTestProblemResponse,
} from '../dist/lib/provider-text-test.js';
import { retryEnqueueOptions } from '../dist/lib/job-enqueue.js';

const enabledProvider = { id: 'provider-a', enabled: true, apiKeyEnv: 'TEST_KEY' };
const textModel = {
  id: 'model-a', providerId: 'provider-a', enabled: true, capabilities: ['text'],
};

test('requires an enabled Provider-owned text Model and configured API key', () => {
  assert.equal(providerTextTestProblem(enabledProvider, textModel, { TEST_KEY: 'set' }), null);
  assert.equal(providerTextTestProblem(
    { ...enabledProvider, enabled: false }, textModel, { TEST_KEY: 'set' },
  ), 'PROVIDER_DISABLED');
  assert.equal(providerTextTestProblem(enabledProvider, textModel, {}),
    'PROVIDER_KEY_NOT_CONFIGURED');
  assert.equal(providerTextTestProblem(enabledProvider, null, { TEST_KEY: 'set' }),
    'MODEL_NOT_FOUND');
  assert.equal(providerTextTestProblem(
    enabledProvider, { ...textModel, providerId: 'other' }, { TEST_KEY: 'set' },
  ), 'MODEL_PROVIDER_MISMATCH');
  assert.equal(providerTextTestProblem(
    enabledProvider, { ...textModel, enabled: false }, { TEST_KEY: 'set' },
  ), 'MODEL_DISABLED');
  assert.equal(providerTextTestProblem(
    enabledProvider, { ...textModel, capabilities: ['image'] }, { TEST_KEY: 'set' },
  ), 'MODEL_CAPABILITY_MISMATCH');
});

test('maps provider test problems to stable, secret-free responses', () => {
  assert.deepEqual(providerTextTestProblemResponse.PROVIDER_KEY_NOT_CONFIGURED, {
    status: 409,
    message: 'The provider key is not configured in the API environment',
  });
  assert.equal('apiKey' in providerTextTestProblemResponse.PROVIDER_KEY_NOT_CONFIGURED, false);
});

test('provider-test manual retries use one attempt while ordinary retries keep defaults', () => {
  assert.deepEqual(retryEnqueueOptions('provider_test'), { attempts: 1 });
  assert.deepEqual(retryEnqueueOptions('text_expand'), {});
});
