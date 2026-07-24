import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

const stagesUrl = new URL('../dist/autopublish-stages.js', import.meta.url);
const orchestratorUrl = new URL('../dist/autopublish-orchestrator.js', import.meta.url);
const outboxUrl = new URL('../dist/autopublish-outbox.js', import.meta.url);

test('orchestrator advances one legal stage at a time', async () => {
  const { nextAutopublishStage } = await import(stagesUrl);
  assert.equal(nextAutopublishStage({
    status: 'queued', currentStage: 'queued', draftJobDone: false,
  }).kind, 'create_draft_job');
  assert.equal(nextAutopublishStage({
    status: 'running', currentStage: 'generating_draft', draftJobDone: true,
  }).nextStage, 'validating');
});

test('terminal, paused and foreign-leased runs are not advanced', async () => {
  const { nextAutopublishStage } = await import(stagesUrl);
  assert.equal(nextAutopublishStage({
    status: 'succeeded', currentStage: 'publishing',
  }).kind, 'stop');
  assert.equal(nextAutopublishStage({
    status: 'conflict_waiting', currentStage: 'issuing_permit',
  }).kind, 'stop');
  assert.equal(nextAutopublishStage({
    status: 'running', currentStage: 'validating', leasedByOther: true,
  }).kind, 'stop');
});

test('duplicate delivery executes a stage once under one lease', async () => {
  const { advanceAutopublishRun } = await import(orchestratorUrl);
  const state = {
    leased: false,
    run: { id: 'run-1', status: 'queued', currentStage: 'queued', inputSnapshotHash: 'hash' },
    commands: [],
  };
  const deps = {
    async acquire() {
      if (state.leased) return null;
      state.leased = true;
      return { token: 'lease-1', snapshot: { ...state.run } };
    },
    async execute(_runId, token, command) {
      assert.equal(token, 'lease-1');
      state.commands.push(command.kind);
      state.run.status = 'running';
      state.run.currentStage = command.nextStage;
    },
    async release() {},
  };

  await Promise.all([
    advanceAutopublishRun('run-1', deps),
    advanceAutopublishRun('run-1', deps),
  ]);

  assert.deepEqual(state.commands, ['create_draft_job']);
});

test('pending outbox rows retry after enqueue omission and are marked once', async () => {
  const { dispatchAutopublishOutbox } = await import(outboxUrl);
  const rows = [{ id: 'outbox-1', runId: 'run-1' }];
  const enqueued = [];
  let fail = true;
  const deps = {
    async claim() {
      return rows[0] ?? null;
    },
    async enqueue(row) {
      if (fail) {
        fail = false;
        throw new Error('redis unavailable');
      }
      enqueued.push(row.id);
    },
    async markDispatched(row) {
      assert.equal(row.id, 'outbox-1');
      rows.shift();
    },
    async release() {},
  };

  await assert.rejects(() => dispatchAutopublishOutbox(deps), /redis unavailable/);
  assert.equal(rows.length, 1);
  await dispatchAutopublishOutbox(deps);
  await dispatchAutopublishOutbox(deps);

  assert.deepEqual(enqueued, ['outbox-1']);
});
