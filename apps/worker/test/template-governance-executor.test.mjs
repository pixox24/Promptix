import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GOVERNANCE_RULES } from '@promptix/shared';

const moduleUrl = new URL('../dist/template-governance-executor.js', import.meta.url);
const before = { templateId: 'a', version: 1, name: 'Old', summary: 'Useful summary text', description: '', semantic: { workflowType: 'generate', outputType: 'portrait', scenarios: [], styles: [], subjects: [], tags: [], unmappedTerms: [], confidence: {} }, variables: [{ key: 'subject', label: 'Subject', type: 'text', required: true }], promptTemplate: '{{subject}} portrait details', negativePrompt: null, coverObjectKey: null, coverUrl: null, status: 'draft', source: 'manual', isFeatured: false, featuredOrder: 0, locale: 'zh' };
const item = { id: 'item-1', idempotencyKey: 'key-item-1', templateId: 'a', baseVersion: 1, action: 'update_metadata', patch: { name: 'New' }, confidence: 0.95, ruleSetVersion: 1, before };

function repository(version = 1) {
  let currentVersion = version;
  const outcomes = new Map();
  const versions = [];
  return { versions, outcomes,
    async findOutcome(key) { return outcomes.get(key) ?? null; },
    async loadTemplate() { return { currentVersion }; },
    async loadActiveRules() { return { version: 1, rules: DEFAULT_GOVERNANCE_RULES }; },
    async applyVersion(input) { if (currentVersion !== input.expectedVersion) return null; currentVersion += 1; versions.push(input); return currentVersion; },
    async recordOutcome(key, outcome) { outcomes.set(key, outcome); },
  };
}

test('applies once, versions immutably, and replays idempotently', async () => {
  const { executeGovernanceItem } = await import(moduleUrl); const repo = repository();
  const first = await executeGovernanceItem(repo, item); const replay = await executeGovernanceItem(repo, item);
  assert.deepEqual(first, { itemId: 'item-1', status: 'applied', appliedVersion: 2 });
  assert.deepEqual(replay, first); assert.equal(repo.versions.length, 1); assert.equal(repo.versions[0].snapshot.version, 2);
});

test('isolates conflicts and failures while preserving successful items', async () => {
  const { executeGovernanceChangeSet } = await import(moduleUrl); const repo = repository();
  const result = await executeGovernanceChangeSet(repo, [item, { ...item, id: 'stale', idempotencyKey: 'stale-key', baseVersion: 1 }]);
  assert.equal(result.status, 'partially_succeeded'); assert.deepEqual(result.outcomes.map((x) => x.status), ['applied', 'conflict']);
});

test('rechecks rules and sends unsafe featured changes to approval', async () => {
  const { executeGovernanceItem } = await import(moduleUrl); const repo = repository();
  const featured = await executeGovernanceItem(repo, { ...item, action: 'feature', patch: { isFeatured: true }, featured: { resultingSlotCount: 20, replacementRatio: 0.5, hoursSinceLastAdjustment: 1 } });
  assert.equal(featured.status, 'awaiting_approval');
  const changedRepo = repository(); changedRepo.loadActiveRules = async () => ({ version: 2, rules: DEFAULT_GOVERNANCE_RULES });
  assert.equal((await executeGovernanceItem(changedRepo, item)).errorCode, 'RULE_SET_CHANGED');
});

test('rollback is a forward version and protects later edits, deadlines, and deletes', async () => {
  const { rollbackGovernanceItem } = await import(moduleUrl); const repo = repository(2);
  const rolled = await rollbackGovernanceItem(repo, { item, appliedVersion: 2, rollbackUntil: new Date(Date.now() + 10000) });
  assert.equal(rolled.status, 'rolled_back'); assert.equal(repo.versions[0].source, 'rollback'); assert.equal(repo.versions[0].snapshot.version, 3);
  assert.equal((await rollbackGovernanceItem(repository(3), { item, appliedVersion: 2, rollbackUntil: new Date(Date.now() + 10000) })).status, 'conflict');
  assert.equal((await rollbackGovernanceItem(repository(2), { item, appliedVersion: 2, rollbackUntil: new Date(0) })).errorCode, 'ROLLBACK_EXPIRED');
  assert.equal((await rollbackGovernanceItem(repository(2), { item: { ...item, action: 'delete' }, appliedVersion: 2, rollbackUntil: new Date(Date.now() + 10000) })).errorCode, 'ROLLBACK_NOT_SUPPORTED');
});
