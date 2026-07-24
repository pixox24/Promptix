import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedAutopublishActions, shouldPollAutopublishRun } from '../src/types/autopublish.ts';

test('polling continues for active states and stops for terminal or paused states', () => {
  assert.equal(shouldPollAutopublishRun('queued'), true);
  assert.equal(shouldPollAutopublishRun('running'), true);
  for (const status of ['conflict_waiting', 'succeeded', 'needs_attention', 'duplicate_found', 'rejected', 'failed', 'cancelled'] as const) {
    assert.equal(shouldPollAutopublishRun(status), false);
  }
});

test('allowed actions come only from the server contract', () => {
  assert.deepEqual(allowedAutopublishActions({
    nextAllowedActions: ['edit_draft', 'retry_cover'],
  }), ['edit_draft', 'retry_cover']);
});
