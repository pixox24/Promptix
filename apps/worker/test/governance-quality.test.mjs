import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../dist/governance-quality.js', import.meta.url);
const base = { id: 'a', name: '清晰的人像模板', summary: '用于生成品牌社交媒体专业人像内容', promptTemplate: 'Create a detailed portrait of {{subject}} in studio lighting', variables: [{ key: 'subject' }], coverUrl: 'https://example.test/a.png', taxonomyReviewStatus: 'reviewed', unmappedTerms: [], confidence: { outputType: 0.95 } };

test('detects deterministic governance quality signals', async () => {
  const { evaluateTemplateQuality } = await import(moduleUrl);
  const issues = evaluateTemplateQuality({ ...base, name: '图', summary: '', promptTemplate: 'Hi {{missing}}', variables: [], coverUrl: null, taxonomyReviewStatus: 'pending', unmappedTerms: [{}], confidence: { outputType: 0.4 } });
  const codes = issues.map((issue) => issue.code);
  for (const code of ['TAXONOMY_MISSING', 'TAXONOMY_UNMAPPED', 'TAXONOMY_LOW_CONFIDENCE', 'COVER_MISSING', 'TITLE_UNCLEAR', 'SUMMARY_UNCLEAR', 'PROMPT_WEAK', 'UNRESOLVED_VARIABLES']) assert.ok(codes.includes(code), code);
});

test('duplicate candidates are normalized, deterministic, and bounded', async () => {
  const { findDuplicateCandidates } = await import(moduleUrl);
  const library = Array.from({ length: 30 }, (_, index) => ({ ...base, id: `copy-${String(index).padStart(2, '0')}` }));
  const candidates = findDuplicateCandidates(base, library, 5);
  assert.equal(candidates.length, 5);
  assert.deepEqual(candidates.map((item) => item.id), ['copy-00', 'copy-01', 'copy-02', 'copy-03', 'copy-04']);
});

test('builds per-template model signals instead of sending an empty placeholder', async () => {
  const { buildGovernanceSignals } = await import(moduleUrl);
  const template = { id: 'a', name: 'A', summary: '', promptTemplate: 'short', variables: [], coverUrl: null, taxonomyReviewStatus: 'pending', unmappedTerms: [] };
  const signals = buildGovernanceSignals([template]);
  assert.equal(signals[0].templateId, 'a');
  assert.ok(signals[0].issues.length > 0);
  assert.deepEqual(signals[0].duplicateCandidates, []);
});

test('automatic taxonomy evidence satisfies the taxonomy prerequisite', async () => {
  const { evaluateTemplateQuality } = await import(moduleUrl);
  const issues = evaluateTemplateQuality({ ...base, taxonomyReviewStatus: 'auto_verified' });
  assert.equal(issues.some((issue) => issue.code === 'TAXONOMY_MISSING'), false);
});
