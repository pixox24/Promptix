import assert from 'node:assert/strict';
import test from 'node:test';

const input = {
  runId: 'run-1', templateId: 'tpl-1', templateVersion: 1,
  ruleSetId: 'rules-1', ruleSetVersion: 4, contentHash: 'content',
  expiresAt: new Date('2026-07-24T01:00:00Z'),
};

function repository() {
  let permit;
  return {
    async create(value) { permit = { id: 'permit-1', ...value, consumedAt: null, revokedAt: null }; return permit; },
    async load() { return permit; },
    async consume(id, at) {
      if (permit.id !== id) throw new Error('PERMIT_NOT_FOUND');
      if (permit.consumedAt) throw new Error('PERMIT_ALREADY_CONSUMED');
      permit.consumedAt = at; return permit;
    },
  };
}

test('permit is bound to run, template version, rules, action, hash and expiry', async () => {
  const { issueAutopublishPermit, verifyAndConsumeAutopublishPermit } =
    await import(new URL('../dist/autopublish-permit.js', import.meta.url));
  const repo = repository();
  const permit = await issueAutopublishPermit(input, repo, 'test-secret');
  assert.equal(permit.templateVersion, 1);
  assert.equal(permit.ruleSetVersion, 4);
  assert.equal(permit.action, 'publish');
  await assert.rejects(
    () => verifyAndConsumeAutopublishPermit({ ...input, contentHash: 'changed', permitId: permit.id, now: new Date('2026-07-24T00:00:00Z') }, repo, 'test-secret'),
    /PERMIT_CONTENT_CHANGED/,
  );
});

test('permit can be consumed only once', async () => {
  const { issueAutopublishPermit, verifyAndConsumeAutopublishPermit } =
    await import(new URL('../dist/autopublish-permit.js', import.meta.url));
  const repo = repository();
  const permit = await issueAutopublishPermit(input, repo, 'test-secret');
  const consume = () => verifyAndConsumeAutopublishPermit({
    ...input, permitId: permit.id, now: new Date('2026-07-24T00:00:00Z'),
  }, repo, 'test-secret');
  await consume();
  await assert.rejects(consume, /PERMIT_ALREADY_CONSUMED/);
});
