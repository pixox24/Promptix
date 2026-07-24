import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('autopublish model job schemas are strict and cannot control run policy', async () => {
  const { autopublishSafetyResultSchema, decideRepairAction } =
    await import(new URL('../dist/autopublish-model-jobs.js', import.meta.url));
  assert.equal(autopublishSafetyResultSchema.safeParse({
    safeToPublish: true, reasonCodes: [], evidence: [], status: 'succeeded',
  }).success, false);
  assert.deepEqual(decideRepairAction({
    repairable: true, allowAutomaticRepair: true, repairCount: 1, maximumRepairAttempts: 2,
  }), { kind: 'create_repair_job', nextRepairCount: 2 });
  assert.deepEqual(decideRepairAction({
    repairable: true, allowAutomaticRepair: true, repairCount: 2, maximumRepairAttempts: 2,
  }), { kind: 'needs_attention', code: 'SCHEMA_INVALID' });
});

test('shared and worker routing include all structured autopublish jobs', async () => {
  const shared = await readFile(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8');
  const routing = await readFile(new URL('../src/model-routing.ts', import.meta.url), 'utf8');
  for (const type of [
    'template_autopublish_repair',
    'template_autopublish_screen',
    'template_autopublish_quality',
    'template_autopublish_counter_review',
  ]) {
    assert.ok(shared.includes(`'${type}'`));
    assert.ok(routing.includes(type));
  }
});
