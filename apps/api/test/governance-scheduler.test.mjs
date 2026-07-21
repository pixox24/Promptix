import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GOVERNANCE_RULES } from '@promptix/shared';

const moduleUrl = new URL('../dist/lib/governance-scheduler.js', import.meta.url);

test('upserts one stable scheduler from the active rule set', async () => {
  const { syncGovernanceScheduler, GOVERNANCE_SCHEDULER_ID } = await import(moduleUrl);
  const calls = []; const queue = { async upsertJobScheduler(...args) { calls.push(['upsert', ...args]); }, async removeJobScheduler(...args) { calls.push(['remove', ...args]); return true; } };
  const result = await syncGovernanceScheduler({ queue, ruleSet: { id: 'rules-1', version: 3, rules: DEFAULT_GOVERNANCE_RULES } });
  assert.equal(result.schedulerId, 'template-governance-default'); assert.equal(GOVERNANCE_SCHEDULER_ID, 'template-governance-default');
  assert.equal(calls[0][1], 'template-governance-default');
  assert.deepEqual(calls[0][2], { pattern: '0 3 * * *', tz: 'Asia/Shanghai' });
  assert.deepEqual(calls[0][3].data, { kind: 'governance_schedule', ruleSetId: 'rules-1', ruleSetVersion: 3 });
});

test('disabled rules remove the scheduler instead of registering it', async () => {
  const { syncGovernanceScheduler } = await import(moduleUrl); const calls = [];
  const queue = { async upsertJobScheduler(...args) { calls.push(['upsert', ...args]); }, async removeJobScheduler(...args) { calls.push(['remove', ...args]); return true; } };
  await syncGovernanceScheduler({ queue, ruleSet: { id: 'rules-1', version: 4, rules: { ...DEFAULT_GOVERNANCE_RULES, schedule: { ...DEFAULT_GOVERNANCE_RULES.schedule, enabled: false } } } });
  assert.deepEqual(calls, [['remove', 'template-governance-default']]);
});
