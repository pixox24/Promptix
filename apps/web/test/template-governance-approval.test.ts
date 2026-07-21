import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('approval panel covers plan groups, destructive confirmation, retry and rollback guards', async () => {
  const source = await readFile(new URL('../src/components/admin/governance/GovernanceApprovalPanel.tsx', import.meta.url), 'utf8');
  for (const label of ['自动', '审批', '冲突', '跳过', '失败']) assert.match(source, new RegExp(label));
  assert.match(source, /confirmation !== '永久删除'/); assert.match(source, /!note\.trim\(\)/);
  assert.match(source, /partially_succeeded/); assert.match(source, /重试失败项/);
  assert.match(source, /!isDelete/); assert.match(source, /回滚期限已过/);
  assert.match(source, /重新生成计划/);
});

test('rule panel edits schedule, confidence, batch, rollback and featured policy as a new version', async () => {
  const source = await readFile(new URL('../src/components/admin/governance/GovernanceRulePanel.tsx', import.meta.url), 'utf8');
  for (const field of ['schedule.enabled', 'schedule.cron', 'schedule.timezone', 'schedule.scanLimit', 'minimumAutoConfidence', 'maximumAutoBatchSize', 'rollbackHours', 'slotLimit', 'maximumReplacementRatio', 'minimumAdjustmentHours']) assert.match(source, new RegExp(field.replace('.', '\\.')));
  assert.match(source, /saveActiveGovernanceRules/); assert.match(source, /保存为新版本/);
});
