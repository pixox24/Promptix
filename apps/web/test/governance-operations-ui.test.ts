import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('governance UI shows operational metrics, localized audits, and read-only roles', async () => {
  const runCenter = await readFile(new URL('../src/components/admin/governance/GovernanceRunCenter.tsx', import.meta.url), 'utf8');
  const agent = await readFile(new URL('../src/pages/admin/AgentSettingsPage.tsx', import.meta.url), 'utf8');
  const rules = await readFile(new URL('../src/components/admin/governance/GovernanceRulePanel.tsx', import.meta.url), 'utf8');
  assert.match(runCenter, /30天运行/);
  assert.match(runCenter, /应用模板变更/);
  assert.match(agent, /只有 owner 可以修改 Agent 配置/);
  assert.match(rules, /修改规则需要 owner 账号/);
  assert.match(rules, /disabled={!canManage}/);
});
