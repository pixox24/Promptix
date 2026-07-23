import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autopublishCreateInputSchema,
  autopublishRulesSchema,
  autopublishRunSchema,
  autopublishTaxonomyVerificationSchema,
  autopublishRunStatusSchema,
  decideAutopublishPolicy,
  governanceExecutionModeSchema,
  templateVersionSnapshotSchema,
} from '../dist/index.js';

const passingAssessment = {
  overallScore: 94,
  criticalDimensions: {
    semanticFidelity: 93,
    promptCoherence: 92,
    variableReuse: 90,
    taxonomyAccuracy: 95,
    coverAlignment: 91,
  },
  hardGateFailures: [],
  requiresCounterReview: false,
};
const passingRules = autopublishRulesSchema.parse({});
const succeededRunInput = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  status: 'succeeded',
  currentStage: 'publishing',
  triggerType: 'delegated',
  requestedBy: null,
  agentId: 'autopublish-agent',
  capabilityGrantId: '22222222-2222-4222-8222-222222222222',
  flowType: 'text_expand',
  sourceType: 'admin_text',
  sourceItemId: 'source-item-1',
  inputSnapshotHash: 'input-sha256',
  ruleSetId: '33333333-3333-4333-8333-333333333333',
  ruleSetVersion: 2,
  taxonomySnapshotHash: 'taxonomy-sha256',
  promptVersion: 'template-autopublish-v1',
  budgetSnapshot: passingRules.budgets,
  budgetConsumed: { modelCalls: 4, coverAttempts: 1, durationMinutes: 7 },
  repairCount: 2,
  templateId: 'template-1',
  permitId: '44444444-4444-4444-8444-444444444444',
  changeSetId: '55555555-5555-4555-8555-555555555555',
  errorCode: null,
  errorDetails: null,
  nextAllowedActions: [],
  createdAt: '2026-07-23T00:00:00.000Z',
  finishedAt: '2026-07-23T01:00:00.000Z',
  observationUntil: '2026-07-26T01:00:00.000Z',
  rollbackUntil: '2026-07-26T01:00:00.000Z',
});

test('contracts expose terminal and resumable autopublish states', () => {
  assert.equal(autopublishRunStatusSchema.parse('needs_attention'), 'needs_attention');
  assert.equal(autopublishRunStatusSchema.parse('duplicate_found'), 'duplicate_found');
  assert.equal(autopublishRunStatusSchema.parse('conflict_waiting'), 'conflict_waiting');
  assert.equal(governanceExecutionModeSchema.parse('autopilot'), 'autopilot');
});

test('policy requires 92 overall, 85 per dimension and no hard-gate failures', () => {
  assert.deepEqual(
    decideAutopublishPolicy({ assessment: passingAssessment, budgetExceeded: false, rules: passingRules }),
    { kind: 'issue_permit' },
  );
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, overallScore: 91 },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'needs_attention');
  assert.equal(decideAutopublishPolicy({
    assessment: {
      ...passingAssessment,
      criticalDimensions: { ...passingAssessment.criticalDimensions, coverAlignment: 84 },
    },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'needs_attention');
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, hardGateFailures: ['SAFETY_REJECTED'] },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'rejected');
  assert.equal(decideAutopublishPolicy({
    assessment: { ...passingAssessment, hardGateFailures: ['EXACT_DUPLICATE'] },
    budgetExceeded: false,
    rules: passingRules,
  }).kind, 'duplicate_found');
});

test('default rules freeze the approved safety and budget values', () => {
  const rules = autopublishRulesSchema.parse({});
  assert.equal(rules.maximumRepairAttempts, 2);
  assert.equal(rules.observationHours, 72);
  assert.equal(rules.frozen, false);
  assert.equal(rules.budgets.maximumModelCalls, 6);
  assert.equal(rules.budgets.maximumCoverAttempts, 2);
  assert.equal(rules.budgets.maximumDurationMinutes, 10);
});

test('rules reject quality or observation minima below the approved floor', () => {
  assert.equal(autopublishRulesSchema.safeParse({ minimumOverallScore: 91 }).success, false);
  assert.equal(autopublishRulesSchema.safeParse({ minimumCriticalDimensionScore: 84 }).success, false);
  assert.equal(autopublishRulesSchema.safeParse({ observationHours: 71 }).success, false);
});

test('run contract preserves trigger provenance, bounded repairs, and lifecycle timestamps', () => {
  const run = autopublishRunSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    status: 'needs_attention',
    currentStage: 'reviewing_quality',
    triggerType: 'delegated',
    requestedBy: null,
    agentId: 'autopublish-agent',
    capabilityGrantId: '22222222-2222-4222-8222-222222222222',
    flowType: 'text_expand',
    sourceType: 'admin_text',
    sourceItemId: 'source-item-1',
    inputSnapshotHash: 'input-sha256',
    ruleSetId: '33333333-3333-4333-8333-333333333333',
    ruleSetVersion: 2,
    taxonomySnapshotHash: 'taxonomy-sha256',
    promptVersion: 'template-autopublish-v1',
    budgetSnapshot: passingRules.budgets,
    budgetConsumed: { modelCalls: 4, coverAttempts: 1, durationMinutes: 7 },
    repairCount: 2,
    templateId: null,
    permitId: null,
    changeSetId: null,
    errorCode: 'QUALITY_THRESHOLD_NOT_MET',
    errorDetails: { score: 91 },
    nextAllowedActions: ['retry_quality'],
    createdAt: '2026-07-23T01:00:00.000Z',
    finishedAt: null,
    observationUntil: null,
    rollbackUntil: null,
  });
  assert.equal(run.triggerType, 'delegated');
  assert.equal(run.repairCount, 2);
  assert.equal(run.observationUntil, null);
  assert.equal(run.rollbackUntil, null);
  assert.equal(autopublishRunSchema.safeParse({ ...run, repairCount: 3 }).success, false);
});

test('taxonomy snapshots support autopublish verification provenance', () => {
  const snapshot = templateVersionSnapshotSchema.parse({
    templateId: 'template-1',
    version: 1,
    name: 'Autopublish template',
    summary: '',
    description: '',
    semantic: {
      workflowType: 'generate', outputType: 'poster', scenarios: [], styles: [], subjects: [], tags: [], unmappedTerms: [], confidence: {},
    },
    variables: [{ key: 'subject', label: 'Subject', type: 'text' }],
    promptTemplate: '{{subject}}',
    status: 'draft',
    source: 'text_expand',
    isFeatured: false,
    featuredOrder: 0,
    locale: 'en',
    taxonomyReviewStatus: 'auto_verified',
  });
  assert.equal(snapshot.taxonomyReviewStatus, 'auto_verified');
  assert.deepEqual(autopublishTaxonomyVerificationSchema.parse({
    runId: '11111111-1111-4111-8111-111111111111',
    agentId: null,
    modelId: '22222222-2222-4222-8222-222222222222',
    promptVersion: 'template-autopublish-v1',
    taxonomySnapshotHash: 'taxonomy-sha256',
    evidenceArtifactId: '33333333-3333-4333-8333-333333333333',
    verifiedAt: '2026-07-23T01:00:00.000Z',
  }), {
    runId: '11111111-1111-4111-8111-111111111111',
    agentId: null,
    modelId: '22222222-2222-4222-8222-222222222222',
    promptVersion: 'template-autopublish-v1',
    taxonomySnapshotHash: 'taxonomy-sha256',
    evidenceArtifactId: '33333333-3333-4333-8333-333333333333',
    verifiedAt: '2026-07-23T01:00:00.000Z',
  });
});

test('create input rejects caller-supplied policy overrides', () => {
  const input = {
    flowType: 'text_expand',
    triggerType: 'delegated',
    sourceType: 'admin_text',
    sourceItemId: 'source-item-1',
    idempotencyKey: 'idempotency-key',
  };
  assert.equal(autopublishCreateInputSchema.safeParse(input).success, true);
  assert.equal(autopublishCreateInputSchema.safeParse({ ...input, budgets: { maximumModelCalls: 20 } }).success, false);
  assert.equal(autopublishCreateInputSchema.safeParse({ ...input, rules: { frozen: false } }).success, false);
});

test('run consumption cannot exceed its budget snapshot', () => {
  const run = succeededRunInput();
  assert.equal(autopublishRunSchema.safeParse({
    ...run,
    budgetConsumed: { ...run.budgetConsumed, modelCalls: run.budgetSnapshot.maximumModelCalls + 1 },
  }).success, false);
  assert.equal(autopublishRunSchema.safeParse({
    ...run,
    budgetConsumed: { ...run.budgetConsumed, coverAttempts: run.budgetSnapshot.maximumCoverAttempts + 1 },
  }).success, false);
  assert.equal(autopublishRunSchema.safeParse({
    ...run,
    budgetConsumed: { ...run.budgetConsumed, durationMinutes: run.budgetSnapshot.maximumDurationMinutes + 1 },
  }).success, false);
});

test('succeeded runs require publish references and a 72-hour observation window', () => {
  const run = succeededRunInput();
  assert.equal(autopublishRunSchema.safeParse(run).success, true);
  for (const field of ['finishedAt', 'templateId', 'permitId', 'changeSetId', 'observationUntil', 'rollbackUntil']) {
    assert.equal(autopublishRunSchema.safeParse({ ...run, [field]: null }).success, false);
  }
  assert.equal(autopublishRunSchema.safeParse({ ...run, observationUntil: '2026-07-26T00:59:59.999Z' }).success, false);
  assert.equal(autopublishRunSchema.safeParse({ ...run, rollbackUntil: '2026-07-26T00:59:59.999Z' }).success, false);
  assert.equal(autopublishRunSchema.safeParse({ ...run, observationUntil: '2026-07-23T00:59:59.999Z' }).success, false);
});

test('non-succeeded runs cannot enter observation and duplicate runs stop before permit issuance', () => {
  const run = succeededRunInput();
  const needsAttention = {
    ...run,
    status: 'needs_attention',
    currentStage: 'reviewing_quality',
    finishedAt: null,
    templateId: null,
    permitId: null,
    changeSetId: null,
    observationUntil: null,
    rollbackUntil: null,
  };
  assert.equal(autopublishRunSchema.safeParse(needsAttention).success, true);
  assert.equal(autopublishRunSchema.safeParse({ ...needsAttention, observationUntil: '2026-07-26T01:00:00.000Z' }).success, false);

  const duplicate = {
    ...needsAttention,
    status: 'duplicate_found',
    currentStage: 'checking_duplicates',
    templateId: 'existing-template',
  };
  assert.equal(autopublishRunSchema.safeParse(duplicate).success, true);
  assert.equal(autopublishRunSchema.safeParse({ ...duplicate, templateId: null }).success, false);
  assert.equal(autopublishRunSchema.safeParse({ ...duplicate, permitId: run.permitId }).success, false);
  assert.equal(autopublishRunSchema.safeParse({ ...duplicate, changeSetId: run.changeSetId }).success, false);
});
