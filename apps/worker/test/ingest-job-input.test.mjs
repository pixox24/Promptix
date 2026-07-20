import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_INGEST_SYSTEM_PROMPTS } from '@promptix/shared';
import { effectiveIngestJobInput } from '../dist/ingest-job-input.js';

test('preserves explicit ingest prompt snapshots', () => {
  assert.equal(effectiveIngestJobInput('text_expand', { text: 'hello', systemPrompt: ' custom ' }).systemPrompt, 'custom');
});

test('uses a flow-specific fallback for legacy ingest jobs', () => {
  assert.equal(effectiveIngestJobInput('text_expand', {}).systemPrompt, DEFAULT_INGEST_SYSTEM_PROMPTS.text_expand);
  assert.equal(effectiveIngestJobInput('image_reverse', {}).systemPrompt, DEFAULT_INGEST_SYSTEM_PROMPTS.image_reverse);
});
