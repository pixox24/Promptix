import assert from 'node:assert/strict';
import test from 'node:test';
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/promptix_test';

test('image input object is never reused as public cover', async () => {
  const { createAutopublishCoverJob } = await import(new URL('../dist/autopublish-cover.js', import.meta.url));
  const jobs = [];
  const coverJob = await createAutopublishCoverJob({
    runId: 'run-1', templateId: 'tpl-red', prompt: 'red portrait',
    privateInputObjectKey: 'private/autopublish/run-1/source.png',
  }, { async create(job) { jobs.push(job); return job; } });
  assert.equal(coverJob.sourceInputObjectKey, undefined);
  assert.match(coverJob.targetPrefix, /^public\/templates\//);
  assert.equal(jobs.length, 1);
});

test('private cleanup expiry is terminal plus 24h bounded by seven days', async () => {
  const { privateInputExpiry } = await import(new URL('../dist/autopublish-cover.js', import.meta.url));
  const createdAt = new Date('2026-07-01T00:00:00Z');
  assert.equal(privateInputExpiry(createdAt, new Date('2026-07-02T00:00:00Z')).toISOString(), '2026-07-03T00:00:00.000Z');
  assert.equal(privateInputExpiry(createdAt, new Date('2026-07-10T00:00:00Z')).toISOString(), '2026-07-08T00:00:00.000Z');
});
