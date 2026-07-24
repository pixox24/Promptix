import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

const draft = {
  name: 'Red portrait', summary: 'A commercial portrait', description: 'Detailed portrait',
  semantic: {
    workflowType: 'generate', outputType: 'portrait',
    scenarios: ['commercial'], styles: ['fashion'], subjects: ['person'],
    tags: ['portrait'], unmappedTerms: [],
    confidence: { outputType: 0.95, scenarios: 0.95, styles: 0.95, subjects: 0.95 },
  },
  variables: [{ id: 'v1', key: 'lighting', label: 'Lighting', type: 'text', required: true, defaultValue: 'soft light' }],
  promptTemplate: 'portrait {{lighting}}',
};
const terms = [
  { id: 'o', dimension: 'output_type', slug: 'portrait' },
  { id: 'sc', dimension: 'scenario', slug: 'commercial' },
  { id: 'st', dimension: 'style', slug: 'fashion' },
  { id: 'su', dimension: 'subject', slug: 'person' },
];

async function executeHappyPath({ image = false } = {}) {
  const [{ persistAutopublishDraft }, { createAutopublishCoverJob }, publish] = await Promise.all([
    import(new URL('../dist/autopublish-template-persistence.js', import.meta.url)),
    import(new URL('../dist/autopublish-cover.js', import.meta.url)),
    import(new URL('../dist/autopublish-publish.js', import.meta.url)),
  ]);
  const runId = image ? 'image-run-1' : 'text-run-1';
  const template = await persistAutopublishDraft({
    runId, agentId: 'agent-1', modelId: '00000000-0000-4000-8000-000000000001',
    promptVersion: 'v1', taxonomySnapshotHash: 'taxonomy-hash',
    evidenceArtifactId: '00000000-0000-4000-8000-000000000002',
    draft: image ? { ...draft, semantic: { ...draft.semantic, workflowType: 'edit' } } : draft,
    taxonomyTerms: terms,
  }, { async persist(value) { return value.template; } });
  const privateInputObjectKey = image ? `private/autopublish/${runId}/input.png` : undefined;
  const cover = await createAutopublishCoverJob({
    runId, templateId: template.id, prompt: draft.promptTemplate, privateInputObjectKey,
  }, { async create(value) { return value; } });
  const changeSet = await publish.createAutopilotPublishChangeSet({
    runId, templateId: template.id, templateVersion: 1,
    ruleSetId: 'rules-1', ruleSetVersion: 1, permitId: 'permit-1',
    rollbackHours: 72, now: new Date('2026-07-24T00:00:00Z'),
  }, { async create(value) { return { id: 'change-1', ...value }; } });
  const run = await publish.completeAutopublishRun({
    runId, templateId: template.id, changeSetStatus: 'succeeded',
    now: new Date('2026-07-24T00:00:00Z'),
  }, { async complete(value) { return value; } });
  return { run, template, cover, changeSet, privateInputObjectKey };
}

test('text happy path ends published, auto-verified and observing for 72 hours', async () => {
  const result = await executeHappyPath();
  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.templateStatus, 'published');
  assert.equal(result.template.taxonomyReviewStatus, 'auto_verified');
  assert.equal(result.run.lifecycleState, 'published_observing');
  assert.equal(result.run.observationUntil.toISOString(), '2026-07-27T00:00:00.000Z');
});

test('image happy path separates private input from public cover and schedules cleanup', async () => {
  const result = await executeHappyPath({ image: true });
  assert.notEqual(result.cover.targetPrefix, result.privateInputObjectKey);
  assert.match(result.cover.targetPrefix, /^public\/templates\//);
  assert.equal(result.cover.sourceInputObjectKey, undefined);
  assert.equal(result.template.source, 'image_reverse');
});

test('exception policies pause or reject without publishing', async () => {
  const [{ decideRepairAction }, { findAutopublishDuplicates }, shared] = await Promise.all([
    import(new URL('../dist/autopublish-model-jobs.js', import.meta.url)),
    import(new URL('../dist/autopublish-validation.js', import.meta.url)),
    import(new URL('../../../packages/shared/dist/template-autopublish.js', import.meta.url)),
  ]);
  assert.equal(decideRepairAction({
    repairable: true,
    allowAutomaticRepair: true,
    repairCount: 2,
    maximumRepairAttempts: 2,
  }).kind, 'needs_attention');
  const duplicate = findAutopublishDuplicates(
    { id: 'new', name: 'Same', summary: 'Same', promptTemplate: 'same {{x}}', variables: [{ key: 'x' }] },
    [{ id: 'existing', name: 'Same', summary: 'Same', promptTemplate: 'same {{x}}', variables: [{ key: 'x' }] }],
  );
  assert.equal(duplicate.kind, 'exact');
  assert.equal(shared.decideAutopublishPolicy({
    assessment: {
      overallScore: 100,
      criticalDimensions: { semanticFidelity: 100, promptCoherence: 100, variableReuse: 100, taxonomyAccuracy: 100, coverAlignment: 100 },
      hardGateFailures: ['SAFETY_REJECTED'], requiresCounterReview: false,
    },
    budgetExceeded: false,
    rules: { minimumOverallScore: 92, minimumCriticalDimensionScore: 85 },
  }).kind, 'rejected');
});
