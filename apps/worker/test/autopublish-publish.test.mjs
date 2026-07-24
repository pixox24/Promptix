import assert from 'node:assert/strict';
import test from 'node:test';

test('autopilot publish creates one permit-bound change set without approval', async () => {
  const { createAutopilotPublishChangeSet } =
    await import(new URL('../dist/autopublish-publish.js', import.meta.url));
  let saved;
  const result = await createAutopilotPublishChangeSet({
    runId: 'run-1', templateId: 'tpl-1', templateVersion: 1,
    ruleSetId: 'rules-1', ruleSetVersion: 4, permitId: 'permit-1',
    rollbackHours: 24, now: new Date('2026-07-24T00:00:00Z'),
  }, { async create(value) { saved = value; return { changeSetId: 'set-1', ...value }; } });
  assert.equal(result.executionMode, 'autopilot');
  assert.equal(result.status, 'auto_executing');
  assert.equal(saved.permitId, 'permit-1');
  assert.equal(saved.approval, undefined);
  assert.equal(saved.rollbackUntil.toISOString(), '2026-07-27T00:00:00.000Z');
});

test('successful publish starts the fixed 72 hour observation window', async () => {
  const { completeAutopublishRun } =
    await import(new URL('../dist/autopublish-publish.js', import.meta.url));
  const result = await completeAutopublishRun({
    runId: 'run-1', templateId: 'tpl-1', changeSetStatus: 'succeeded',
    now: new Date('2026-07-24T00:00:00Z'),
  }, { async complete(value) { return value; } });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.lifecycleState, 'published_observing');
  assert.equal(result.observationUntil.toISOString(), '2026-07-27T00:00:00.000Z');
});
