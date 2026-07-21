import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../dist/lib/template-versioning.js', import.meta.url);

function repository(initial) {
  let row = initial ? structuredClone(initial) : null;
  const versions = [];
  const idempotency = new Map();
  return {
    versions,
    async findIdempotentResult(key) { return idempotency.get(key) ?? null; },
    async loadTemplate() { return row ? structuredClone(row) : null; },
    async updateIfVersion(_id, expectedVersion, patch) {
      if (!row || row.currentVersion !== expectedVersion) return null;
      row = { ...row, ...patch, currentVersion: expectedVersion + 1 };
      return structuredClone(row);
    },
    async insertVersion(value) { versions.push(structuredClone(value)); },
    async recordIdempotentResult(key, value) { idempotency.set(key, structuredClone(value)); },
  };
}

test('records initial version with semantic taxonomy assignments', async () => {
  const { recordInitialTemplateVersion } = await import(moduleUrl);
  const repo = repository(null);
  const template = { id: 'portrait', name: 'Portrait', currentVersion: 1, isFeatured: true };
  const semantic = { workflowType: 'generate', outputType: 'portrait', scenarios: ['social'], styles: [], subjects: [], tags: [], unmappedTerms: [], confidence: {} };
  await recordInitialTemplateVersion(repo, template, semantic, { source: 'admin' });
  assert.equal(repo.versions[0].version, 1);
  assert.deepEqual(repo.versions[0].snapshot.semantic.scenarios, ['social']);
});

test('increments once, preserves omitted state, rejects stale writes, and replays idempotently', async () => {
  const { updateTemplateWithVersion } = await import(moduleUrl);
  const repo = repository({ id: 'portrait', name: 'Old', currentVersion: 1, isFeatured: true, taxonomyReviewStatus: 'reviewed' });
  const input = { id: 'portrait', expectedVersion: 1, idempotencyKey: 'save-1', patch: { name: 'New' }, semantic: null, actor: { source: 'admin' } };
  const first = await updateTemplateWithVersion(repo, input);
  assert.equal(first.ok, true);
  assert.equal(first.template.currentVersion, 2);
  assert.equal(first.template.isFeatured, true);
  assert.equal(first.template.taxonomyReviewStatus, 'reviewed');
  assert.equal(repo.versions.length, 1);

  const replay = await updateTemplateWithVersion(repo, input);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(repo.versions.length, 1);

  const stale = await updateTemplateWithVersion(repo, { ...input, idempotencyKey: 'save-2' });
  assert.deepEqual(stale, { ok: false, code: 'VERSION_CONFLICT', currentVersion: 2 });
  assert.equal(repo.versions.length, 1);
});
