import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTerminalQueueJobForRetry } from '../dist/lib/job-retry.js';

function queueWith(state) {
  let removed = false;
  return {
    queue: {
      async getJob(id) {
        assert.equal(id, 'bull-job-1');
        return state === 'missing' ? undefined : {
          async getState() { return state; },
          async remove() { removed = true; },
        };
      },
    },
    wasRemoved() { return removed; },
  };
}

test('removes a retained failed BullMQ job before reusing its jobId', async () => {
  const fake = queueWith('failed');
  await clearTerminalQueueJobForRetry(fake.queue, 'bull-job-1');
  assert.equal(fake.wasRemoved(), true);
});

test('allows retry when the old BullMQ job was already removed', async () => {
  const fake = queueWith('missing');
  await clearTerminalQueueJobForRetry(fake.queue, 'bull-job-1');
  assert.equal(fake.wasRemoved(), false);
});

test('rejects retry while the previous BullMQ job is non-terminal', async () => {
  const fake = queueWith('active');
  await assert.rejects(
    () => clearTerminalQueueJobForRetry(fake.queue, 'bull-job-1'),
    /still active/,
  );
  assert.equal(fake.wasRemoved(), false);
});
