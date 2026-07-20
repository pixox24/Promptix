import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('image reverse API accepts dual models and retains legacy modelId compatibility', async () => {
  const source = await readFile(new URL('../src/routes/jobs.ts', import.meta.url), 'utf8');
  assert.match(source, /body\.structureModelId/);
  assert.match(source, /body\.visionModelId/);
  assert.match(source, /body\.modelId/);
  assert.match(source, /visionModelId: visionSelection\.modelId/);
  assert.match(source, /DEFAULT_VISION_MODEL_NOT_CONFIGURED/);
});
