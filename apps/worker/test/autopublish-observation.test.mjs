import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

const healthy = {
  coverAvailable: true, promptCompiles: true, taxonomyEnabled: true,
  duplicateSimilarity: 0.2, generationAttempts: 10, generationFailures: 0,
  safetyRejected: false, batchFailureRate: 0, observationExpired: true,
};

test('observation stabilizes a healthy template after 72 hours', async () => {
  const { evaluateAutopublishObservation } = await import(new URL('../dist/autopublish-observation.js', import.meta.url));
  assert.deepEqual(evaluateAutopublishObservation(healthy), { action: 'stabilize' });
});

test('medium risk limits exposure before archive', async () => {
  const { evaluateAutopublishObservation } = await import(new URL('../dist/autopublish-observation.js', import.meta.url));
  assert.deepEqual(evaluateAutopublishObservation({
    ...healthy, generationAttempts: 20, generationFailures: 9,
  }), { action: 'limit_exposure', reasonCode: 'GENERATION_FAILURE_RATE' });
});

test('safety or missing public resources archives immediately', async () => {
  const { evaluateAutopublishObservation } = await import(new URL('../dist/autopublish-observation.js', import.meta.url));
  assert.deepEqual(evaluateAutopublishObservation({ ...healthy, safetyRejected: true }), {
    action: 'archive', reasonCode: 'SAFETY_REJECTED',
  });
});
