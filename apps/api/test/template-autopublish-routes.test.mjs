import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('autopublish routes expose create, read, cancel, recovery actions and exceptions', async () => {
  const source = await readFile(new URL('../src/routes/autopublish.ts', import.meta.url), 'utf8');
  for (const route of [
    "post('/runs'",
    "get('/runs/:id'",
    "post('/runs/:id/cancel'",
    "post('/runs/:id/actions/:action'",
    "get('/exceptions'",
  ]) {
    assert.ok(source.includes(route), `missing ${route}`);
  }
  assert.match(source, /requireOwner/);
  assert.match(source, /nextAllowedActions/);
  assert.match(source, /idempotencyKey/);
});

test('autopublish image intake is private and has bounded retention', async () => {
  const source = await readFile(new URL('../src/routes/autopublish.ts', import.meta.url), 'utf8');
  assert.match(source, /private\/autopublish\/\$\{runId\}\/source\.\$\{extension\}/);
  assert.match(source, /MAX_PRIVATE_INPUT_RETENTION_MS/);
  assert.doesNotMatch(source, /statusUrl:.*object|imageUrl:/s);
});

test('autopublish failures use the stable recovery contract', async () => {
  const source = await readFile(new URL('../src/routes/autopublish.ts', import.meta.url), 'utf8');
  assert.match(source, /retryable/);
  assert.match(source, /nextAllowedActions/);
  assert.match(source, /AUTOPUBLISH_INTERNAL_ERROR/);
});

test('autopublish run wakeups use a dedicated idempotent queue job', async () => {
  const source = await readFile(new URL('../src/lib/job-enqueue.ts', import.meta.url), 'utf8');
  assert.match(source, /enqueueAutopublishRun/);
  assert.match(source, /autopublish:\$\{runId\}/);
});
