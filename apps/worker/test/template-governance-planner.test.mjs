import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../dist/template-governance-planner.js', import.meta.url);
const snapshot = { templateId: 'a', version: 7, name: 'Name', summary: 'Summary', description: '', semantic: { workflowType: 'generate', outputType: 'portrait', scenarios: [], styles: [], subjects: [], tags: [], unmappedTerms: [], confidence: {} }, variables: [{ key: 'subject', label: 'Subject', type: 'text', required: true }], promptTemplate: '{{subject}} portrait', negativePrompt: null, coverObjectKey: null, coverUrl: null, status: 'draft', source: 'manual', isFeatured: false, featuredOrder: 0, locale: 'zh' };

test('derives risk and approval while preserving exact before snapshot', async () => {
  const { normalizeGovernanceProposal } = await import(moduleUrl);
  const normalized = normalizeGovernanceProposal({ raw: { templateId: 'a', action: 'update_prompt', proposedPatch: { promptTemplate: 'Changed {{subject}}' }, reasonCodes: ['PROMPT_BEHAVIOR_CHANGE'], explanation: '修复行为', confidence: 0.99, riskLevel: 'low', requiresApproval: false }, before: snapshot, taxonomySlugs: new Set(['portrait']) });
  assert.equal(normalized.baseVersion, 7);
  assert.equal(normalized.current, snapshot);
  assert.equal(normalized.riskLevel, 'high');
  assert.equal(normalized.requiresApproval, true);
});

test('rejects invented taxonomy and malformed batches atomically', async () => {
  const { normalizeGovernanceProposal, normalizeGovernanceBatch } = await import(moduleUrl);
  assert.throws(() => normalizeGovernanceProposal({ raw: { templateId: 'a', proposedPatch: { semantic: { ...snapshot.semantic, outputType: 'invented' } }, reasonCodes: ['TAXONOMY_MISSING'], explanation: '分类', confidence: 0.9 }, before: snapshot, taxonomySlugs: new Set(['portrait']) }), /Unknown taxonomy/);
  assert.throws(() => normalizeGovernanceBatch({ raw: [{ templateId: 'a' }, { broken: true }], snapshots: new Map([['a', snapshot]]), taxonomySlugs: new Set(['portrait']) }));
});
