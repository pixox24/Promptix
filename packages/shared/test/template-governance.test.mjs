import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyGovernanceRisk,
  governanceProposalSchema,
  governanceQueueIdSchema,
  governanceRuleSetSchema,
  governanceSelectionScopeSchema,
  templateVersionSnapshotSchema,
} from '../dist/index.js';

const rules = governanceRuleSetSchema.parse({
  schedule: {
    enabled: true,
    cron: '0 3 * * *',
    timezone: 'Asia/Shanghai',
    scanLimit: 50,
  },
  automaticFields: ['name', 'summary', 'semantic', 'tags'],
  alwaysApprove: ['promptTemplate', 'variables', 'publish', 'archive', 'delete'],
  minimumAutoConfidence: 0.85,
  maximumAutoBatchSize: 50,
  rollbackHours: 168,
  featured: {
    slotLimit: 12,
    maximumReplacementRatio: 0.2,
    minimumAdjustmentHours: 24,
  },
});

const semantic = {
  workflowType: 'generate',
  outputType: 'poster',
  scenarios: ['poster_event_material'],
  styles: ['minimalism'],
  subjects: ['typography_layout'],
  tags: ['海报'],
  unmappedTerms: [],
  confidence: { outputType: 0.96, scenarios: 0.9, styles: 0.9, subjects: 0.91 },
};

test('governance queue identifiers are stable machine values', () => {
  assert.deepEqual(governanceQueueIdSchema.options, [
    'taxonomy_confirmation',
    'duplicate_candidates',
    'quality_issues',
    'featured_candidates',
    'pending_approval',
    'failed_items',
  ]);
});

test('governance rules carry versioned Agent configuration with safe defaults', () => {
  assert.deepEqual(rules.agent, { modelId: null, promptVersion: 'template-governance-v1', systemPrompt: '' });
  const configured = governanceRuleSetSchema.parse({ ...rules, agent: { modelId: '11111111-1111-4111-8111-111111111111', promptVersion: 'governance-v2', systemPrompt: '只返回结构化治理建议。' } });
  assert.equal(configured.agent.promptVersion, 'governance-v2');
  assert.equal(configured.agent.modelId, '11111111-1111-4111-8111-111111111111');
});

test('selection scope distinguishes explicit ids from a captured query', () => {
  assert.deepEqual(
    governanceSelectionScopeSchema.parse({ mode: 'explicit', templateIds: ['tpl-a'] }),
    { mode: 'explicit', templateIds: ['tpl-a'], proposalIds: [] },
  );
  assert.equal(
    governanceSelectionScopeSchema.safeParse({ mode: 'explicit', templateIds: [] }).success,
    false,
  );

  const query = governanceSelectionScopeSchema.parse({
    mode: 'query',
    query: { queue: 'quality_issues', source: 'image_reverse', sort: 'updated_desc' },
    exclusions: ['tpl-b'],
    snapshotAt: '2026-07-21T08:00:00.000Z',
  });
  assert.equal(query.mode, 'query');
  assert.deepEqual(query.exclusions, ['tpl-b']);
});

test('automatic metadata is low risk only above policy thresholds', () => {
  assert.deepEqual(
    classifyGovernanceRisk({
      action: 'update_metadata',
      changedFields: ['name', 'summary', 'semantic', 'tags'],
      confidence: 0.92,
      batchSize: 12,
    }, rules),
    { riskLevel: 'low', requiresApproval: false, automatic: true },
  );

  assert.deepEqual(
    classifyGovernanceRisk({
      action: 'update_metadata',
      changedFields: ['summary'],
      confidence: 0.6,
      batchSize: 12,
    }, rules),
    { riskLevel: 'medium', requiresApproval: true, automatic: false },
  );
});

test('prompt, variable, and lifecycle changes always require approval', () => {
  for (const input of [
    { action: 'update_prompt', changedFields: ['promptTemplate'] },
    { action: 'update_variables', changedFields: ['variables'] },
    { action: 'publish', changedFields: [] },
    { action: 'archive', changedFields: [] },
    { action: 'delete', changedFields: [] },
  ]) {
    assert.deepEqual(
      classifyGovernanceRisk({ ...input, confidence: 1, batchSize: 1 }, rules),
      { riskLevel: 'high', requiresApproval: true, automatic: false },
    );
  }
});

test('featured changes are automatic only inside every configured boundary', () => {
  const safe = classifyGovernanceRisk({
    action: 'feature',
    changedFields: ['isFeatured', 'featuredOrder'],
    confidence: 0.93,
    batchSize: 2,
    featured: {
      resultingSlotCount: 12,
      replacementRatio: 0.16,
      hoursSinceLastAdjustment: 30,
    },
  }, rules);
  assert.deepEqual(safe, { riskLevel: 'medium', requiresApproval: false, automatic: true });

  for (const featured of [
    { resultingSlotCount: 13, replacementRatio: 0.16, hoursSinceLastAdjustment: 30 },
    { resultingSlotCount: 12, replacementRatio: 0.25, hoursSinceLastAdjustment: 30 },
    { resultingSlotCount: 12, replacementRatio: 0.16, hoursSinceLastAdjustment: 4 },
  ]) {
    assert.deepEqual(
      classifyGovernanceRisk({
        action: 'feature',
        changedFields: ['isFeatured'],
        confidence: 0.93,
        batchSize: 2,
        featured,
      }, rules),
      { riskLevel: 'high', requiresApproval: true, automatic: false },
    );
  }
});

test('version snapshots and proposals round-trip without localized state values', () => {
  const current = templateVersionSnapshotSchema.parse({
    templateId: 'tpl-poster',
    version: 3,
    name: '活动海报',
    summary: '用于活动宣传的视觉海报',
    description: '高冲击力活动视觉',
    semantic,
    variables: [{ id: 'var-1', key: 'subject', label: '主体', type: 'text', required: true }],
    promptTemplate: '{{subject}}，活动海报',
    negativePrompt: null,
    coverObjectKey: 'public/templates/tpl-poster/cover.png',
    coverUrl: 'https://example.com/cover.png',
    status: 'published',
    source: 'manual',
    isFeatured: false,
    featuredOrder: 0,
    locale: 'zh',
  });

  const proposal = governanceProposalSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    runId: '22222222-2222-4222-8222-222222222222',
    templateId: current.templateId,
    baseVersion: current.version,
    current,
    proposedPatch: { summary: '更清晰的活动海报摘要', tags: ['活动', '海报'] },
    reasonCodes: ['SUMMARY_UNCLEAR'],
    explanation: '摘要缺少明确使用场景。',
    confidence: 0.91,
    riskLevel: 'low',
    requiresApproval: false,
    status: 'planned',
  });

  assert.equal(proposal.status, 'planned');
  assert.equal(proposal.riskLevel, 'low');
  assert.equal(proposal.current.semantic.outputType, 'poster');
});
