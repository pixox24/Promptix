import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleIngestModels, eligibleVisionModels, ingestFlowStatus, parseIngestDraft } from '../src/lib/ingest-workflow.ts';
import type { AdminModel } from '../src/types/adminModels.ts';

const model = (overrides: Partial<AdminModel> = {}): AdminModel => ({
  id: 'model', providerId: 'provider', providerName: 'Provider', providerEnabled: true,
  adapterType: 'openai_compatible', apiKeyConfigured: true, name: 'Model', modelId: 'model',
  capabilities: ['text', 'structured_output'], defaults: {}, enabled: true,
  isDefaultText: true, isDefaultVision: false, isDefaultImage: false, ...overrides,
});

test('filters ingest models to enabled structured text models', () => {
  assert.deepEqual(eligibleIngestModels([model(), model({ id: 'image', capabilities: ['image'] }), model({ id: 'off', enabled: false })]).map((item) => item.id), ['model']);
});

test('filters vision candidates independently from structure candidates', () => {
  const models = [model({ id: 'vision', capabilities: ['text', 'vision'] }), model({ id: 'structure', capabilities: ['text', 'structured_output'] })];
  assert.deepEqual(eligibleVisionModels(models).map((item) => item.id), ['vision']);
  assert.deepEqual(eligibleIngestModels(models).map((item) => item.id), ['structure']);
});

test('maps asynchronous work to entry-card status', () => {
  assert.equal(ingestFlowStatus(undefined), 'idle');
  assert.equal(ingestFlowStatus({ status: 'queued' }), 'queued');
  assert.equal(ingestFlowStatus({ status: 'running' }), 'running');
  assert.equal(ingestFlowStatus({ status: 'succeeded', output: {} }), 'review');
  assert.equal(ingestFlowStatus({ status: 'failed' }), 'failed');
});

test('accepts only complete TemplateDraft job output', () => {
  assert.equal(parseIngestDraft({}).success, false);
  assert.equal(parseIngestDraft({
    name: 'Draft', summary: 'Summary', description: 'Description', category: 'illustration',
    tags: [], scenarios: [], variables: [{ id: 'var-1', key: 'subject', label: 'Subject', type: 'text' }],
    promptTemplate: '{{subject}}',
  }).success, true);
});
