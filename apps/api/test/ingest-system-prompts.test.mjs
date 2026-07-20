import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveIngestSystemPrompt,
  normalizeIngestSystemPrompt,
} from '../dist/lib/ingest-system-prompts.js';

test('normalizes valid prompts and rejects invalid values', () => {
  assert.equal(normalizeIngestSystemPrompt('  custom  '), 'custom');
  assert.throws(() => normalizeIngestSystemPrompt('  '), /System prompt/);
  assert.throws(() => normalizeIngestSystemPrompt('x'.repeat(20_001)), /System prompt/);
});

test('temporary override wins without changing configured fallback', () => {
  assert.equal(effectiveIngestSystemPrompt('text_expand', ' temporary ', 'configured'), 'temporary');
  assert.equal(effectiveIngestSystemPrompt('image_reverse', undefined, 'configured'), 'configured');
});
