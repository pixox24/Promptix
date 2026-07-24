import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

test('draft creation writes auto_verified taxonomy and initial version atomically', async () => {
  const { persistAutopublishDraft } = await import(new URL('../dist/autopublish-template-persistence.js', import.meta.url));
  const state = { templates: [], versions: [], assignments: [], audits: [] };
  const repository = { async persist(input) {
    state.templates.push(input.template);
    state.versions.push(input.version);
    state.assignments.push(...input.assignments);
    state.audits.push(input.audit);
    return input.template;
  } };
  const created = await persistAutopublishDraft({
    runId: 'run-1', agentId: 'agent-1',
    modelId: '00000000-0000-4000-8000-000000000001',
    promptVersion: 'v1', taxonomySnapshotHash: 'taxonomy-hash',
    evidenceArtifactId: '00000000-0000-4000-8000-000000000002',
    draft: {
      name: 'Red portrait', summary: 'A commercial portrait', description: 'Detailed',
      semantic: {
        workflowType: 'generate', outputType: 'portrait',
        scenarios: ['commercial'], styles: ['fashion'], subjects: ['person'],
        tags: ['portrait'], unmappedTerms: [],
        confidence: { outputType: 0.95, scenarios: 0.9, styles: 0.9, subjects: 0.9 },
      },
      variables: [{ id: 'v1', key: 'lighting', label: 'Lighting', type: 'text', required: true }],
      promptTemplate: 'portrait {{lighting}}',
    },
    taxonomyTerms: [
      { id: 'o', dimension: 'output_type', slug: 'portrait' },
      { id: 'sc', dimension: 'scenario', slug: 'commercial' },
      { id: 'st', dimension: 'style', slug: 'fashion' },
      { id: 'su', dimension: 'subject', slug: 'person' },
    ],
  }, repository);
  assert.equal(created.taxonomyReviewStatus, 'auto_verified');
  assert.equal(created.status, 'draft');
  assert.equal(state.templates.length, 1);
  assert.equal(state.versions.length, 1);
  assert.equal(state.assignments.every((row) => row.source === 'ai'), true);
});
