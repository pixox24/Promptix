import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

test('duplicate delivery after every stage boundary creates one artifact per idempotency key', async () => {
  const { nextAutopublishStage } = await import(new URL('../dist/autopublish-stages.js', import.meta.url));
  const boundaries = [
    ['queued', {}],
    ['generating_draft', { draftJobDone: true }],
    ['validating', {}],
    ['verifying_taxonomy', {}],
    ['screening', {}],
    ['checking_duplicates', {}],
    ['creating_template', {}],
    ['generating_cover', { coverJobDone: true }],
    ['reviewing_quality', {}],
    ['adversarial_review', {}],
    ['issuing_permit', {}],
    ['publishing', { publishDone: true }],
  ];
  const artifacts = new Map();
  for (const [currentStage, flags] of boundaries) {
    const command = nextAutopublishStage({ status: currentStage === 'queued' ? 'queued' : 'running', currentStage, ...flags });
    const key = `${currentStage}:${command.kind}`;
    for (let delivery = 0; delivery < 2; delivery += 1) {
      if (!artifacts.has(key)) artifacts.set(key, { currentStage, command: command.kind });
    }
  }
  assert.equal(artifacts.size, boundaries.length);
  assert.equal([...artifacts.values()].filter((row) => row.command === 'persist_template').length, 1);
  assert.equal([...artifacts.values()].filter((row) => row.command === 'issue_permit').length, 1);
  assert.equal([...artifacts.values()].filter((row) => row.command === 'complete').length, 1);
});

test('crash before queue acknowledgement is retried without duplicate stage execution', async () => {
  const { dispatchAutopublishOutbox } = await import(new URL('../dist/autopublish-outbox.js', import.meta.url));
  const row = { id: 'outbox-1', runId: 'run-1' };
  let dispatched = false;
  let stageExecutions = 0;
  const stageKeys = new Set();
  const deps = {
    async claim() { return dispatched ? null : row; },
    async enqueue(value) {
      if (!stageKeys.has(value.id)) {
        stageKeys.add(value.id);
        stageExecutions += 1;
      }
    },
    async markDispatched() {
      if (!dispatched) {
        dispatched = true;
        throw new Error('simulated termination before acknowledgement');
      }
    },
    async release() {},
  };
  await assert.rejects(() => dispatchAutopublishOutbox(deps), /simulated termination/);
  // The durable row is delivered again after restart.
  dispatched = false;
  deps.markDispatched = async () => { dispatched = true; };
  await dispatchAutopublishOutbox(deps);
  assert.equal(stageExecutions, 1);
});
