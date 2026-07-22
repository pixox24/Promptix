import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GOVERNANCE_RULES } from '@promptix/shared';

const moduleUrl = new URL('../dist/lib/governance-service.js', import.meta.url);
const scope = { mode: 'explicit', templateIds: ['a'], proposalIds: [] };

function fixture() {
  const events = []; let runStatus = 'queued'; let changeStatus = 'awaiting_approval';
  const repository = {
    async activeRules() { return { id: 'rules', version: 1, rules: DEFAULT_GOVERNANCE_RULES }; },
    async createRun(input) { events.push(['run', input]); return { id: 'run-1', status: runStatus }; },
    async failRun(_id, code) { runStatus = 'failed'; events.push(['failRun', code]); },
    async loadChangeSet() { return { id: 'set-1', runId: 'run-1', status: changeStatus, executionMode: 'approval', ruleSetVersion: 1, proposals: [{ id: 'p1', templateId: 'a', baseVersion: 1, action: 'archive', itemStatus: 'awaiting_approval' }] }; },
    async currentTemplateVersions() { return new Map([['a', 1]]); },
    async transitionChangeSet(input) { changeStatus = input.to; events.push(['transition', input]); return { id: input.id, status: input.to }; },
    async failChangeSet(_id, code) { changeStatus = 'failed'; events.push(['failSet', code]); },
    async saveActiveRules(input) { return { id: 'rules-2', version: 2, rules: input.rules }; },
    async refreshRunState() {},
  };
  const queue = { async enqueue(input) { events.push(['queue', input]); } };
  return { repository, queue, events, getRunStatus: () => runStatus, getChangeStatus: () => changeStatus };
}

test('stores structured scope before queueing a natural-language run', async () => {
  const { GovernanceService } = await import(moduleUrl); const f = fixture(); const service = new GovernanceService(f.repository, f.queue);
  await service.createRun({ goal: '整理需要确认的分类', scope, requestedBy: 'admin', idempotencyKey: 'run-key-1', promptVersion: 'v1' });
  assert.deepEqual(f.events.map((event) => event[0]), ['run', 'queue']); assert.deepEqual(f.events[0][1].scope, scope);
});

test('queue failures become visible failed state', async () => {
  const { GovernanceService } = await import(moduleUrl); const f = fixture(); f.queue.enqueue = async () => { throw new Error('offline'); };
  const service = new GovernanceService(f.repository, f.queue);
  await assert.rejects(() => service.createRun({ goal: 'inspect', scope, requestedBy: 'admin', idempotencyKey: 'run-key-2', promptVersion: 'v1' }), /入队失败/);
  assert.equal(f.getRunStatus(), 'failed');
});

test('preparation failures preserve their actionable error code', async () => {
  const { GovernanceService, GovernanceStateError } = await import(moduleUrl); const f = fixture();
  f.queue.enqueue = async () => { throw new GovernanceStateError('SNAPSHOT_MISSING', '模板缺少版本快照'); };
  const service = new GovernanceService(f.repository, f.queue);
  await assert.rejects(() => service.createRun({ goal: 'inspect', scope, requestedBy: 'admin', idempotencyKey: 'run-key-3', promptVersion: 'v1' }), /缺少版本快照/);
  assert.deepEqual(f.events.at(-1), ['failRun', 'SNAPSHOT_MISSING']);
});

test('approval rechecks rules and versions and enqueues only after transition', async () => {
  const { GovernanceService } = await import(moduleUrl); const f = fixture(); const service = new GovernanceService(f.repository, f.queue);
  await service.approve({ changeSetId: 'set-1', reviewerId: 'admin', note: '确认下架', idempotencyKey: 'approve-1' });
  assert.deepEqual(f.events.map((event) => event[0]), ['transition', 'queue']);
  const stale = fixture(); stale.repository.currentTemplateVersions = async () => new Map([['a', 2]]);
  await assert.rejects(() => new GovernanceService(stale.repository, stale.queue).approve({ changeSetId: 'set-1', reviewerId: 'admin', note: '确认', idempotencyKey: 'approve-2' }), /版本已变化/);
});

test('delete approval uses the standard approval transition without typed confirmation', async () => {
  const { GovernanceService } = await import(moduleUrl); const f = fixture(); f.repository.loadChangeSet = async () => ({ id: 'set-1', runId: 'run-1', status: 'awaiting_approval', executionMode: 'approval', ruleSetVersion: 1, proposals: [{ id: 'p1', templateId: 'a', baseVersion: 1, action: 'delete', itemStatus: 'awaiting_approval' }] });
  const service = new GovernanceService(f.repository, f.queue);
  await service.approve({ changeSetId: 'set-1', reviewerId: 'admin', note: '', idempotencyKey: 'delete-1' });
  assert.deepEqual(f.events.map((event) => event[0]), ['transition', 'queue']);
});
