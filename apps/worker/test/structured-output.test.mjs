import assert from 'node:assert/strict';
import test from 'node:test';
import { outputDiagnostics, parseRepairableJson } from '../dist/structured-output.js';

test('extracts JSON from fences and reasoning wrappers', () => {
  const parsed = parseRepairableJson('<think>private reasoning</think>\n```json\n{"ok":true}\n```');
  assert.deepEqual(parsed.value, { ok: true });
  assert.equal(parsed.repaired, true);
});

test('repairs minor JSON syntax failures', () => {
  const parsed = parseRepairableJson('{"name":"demo",}');
  assert.deepEqual(parsed.value, { name: 'demo' });
  assert.equal(parsed.repaired, true);
});

test('diagnostic previews are bounded and redact credentials', () => {
  const details = outputDiagnostics(`api_key=secret-value ${'x'.repeat(1200)}`);
  assert.equal(details.outputLength > 1200, true);
  assert.equal(details.outputPreviewStart.includes('secret-value'), false);
  assert.equal(details.outputPreviewStart.length <= 500, true);
  assert.equal(details.outputPreviewEnd.length <= 500, true);
});
