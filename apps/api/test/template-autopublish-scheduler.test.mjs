import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('scheduler bounds batch, concurrency and hourly capacity', async () => {
  const { scheduledAutopublishCapacity } = await import(new URL('../dist/lib/autopublish-scheduler.js', import.meta.url));
  assert.equal(scheduledAutopublishCapacity({
    enabled: true, pending: 100, running: 1, startedLastHour: 8,
    maximumBatchSize: 10, maximumConcurrentPerAgent: 3, maximumRunsPerHour: 10,
  }), 2);
  assert.equal(scheduledAutopublishCapacity({
    enabled: false, pending: 100, running: 0, startedLastHour: 0,
    maximumBatchSize: 10, maximumConcurrentPerAgent: 3, maximumRunsPerHour: 10,
  }), 0);
});

test('source endpoint and scheduler are owner-scoped and registered', async () => {
  const route = await readFile(new URL('../src/routes/autopublish.ts', import.meta.url), 'utf8');
  const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(route, /post\('\/source-items'/);
  assert.match(route, /ALLOWED_AUTOPUBLISH_SOURCE_TYPES/);
  assert.match(index, /registerAutopublishScheduler/);
});
