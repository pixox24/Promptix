import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { didGovernanceRunFinish } from '../src/hooks/useGovernanceRuns';

test('admin templates route renders the three-column governance workspace', async () => {
  const admin = await readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/pages/admin/TemplateGovernancePage.tsx', import.meta.url), 'utf8');
  assert.match(admin, /const TemplateGovernancePage = lazy/);
  assert.match(admin, /path="templates" element={<TemplateGovernancePage/);
  for (const component of ['GovernanceQueueSidebar', 'GovernanceTemplateTable', 'GovernanceInspector', 'GovernanceCommandBar', 'GovernanceBulkBar']) assert.match(page, new RegExp(component));
  assert.match(page, /\/admin\/templates\/new/);
});

test('table exposes governance columns and row inspection without navigation', async () => {
  const table = await readFile(new URL('../src/components/admin/governance/GovernanceTemplateTable.tsx', import.meta.url), 'utf8');
  for (const label of ['选择', '模板', '来源', '当前 / 建议分类', '质量 / Agent', '生命周期', '更新时间']) assert.match(table, new RegExp(label));
  assert.match(table, /onClick=\{\(\) => onInspect\(item\.id\)\}/);
  assert.doesNotMatch(table, /<Link|navigate\(/);
});

test('governance workspace exposes run feedback, polling, filters and pagination', async () => {
  const page = await readFile(new URL('../src/pages/admin/TemplateGovernancePage.tsx', import.meta.url), 'utf8');
  const runs = await readFile(new URL('../src/hooks/useGovernanceRuns.ts', import.meta.url), 'utf8');
  const command = await readFile(new URL('../src/components/admin/governance/GovernanceCommandBar.tsx', import.meta.url), 'utf8');
  for (const component of ['GovernanceRunCenter', 'GovernanceRunStatusBar', 'GovernanceToolbar', 'GovernancePagination', 'GovernanceStatePanel']) assert.match(page, new RegExp(component));
  assert.match(runs, /setInterval/); assert.match(runs, /fetchGovernanceRun/);
  assert.match(command, /治理任务提交失败/); assert.match(command, /确认提交/);
});

test('run polling recognizes active-to-terminal transitions', () => {
  assert.equal(didGovernanceRunFinish('queued', 'succeeded'), true);
  assert.equal(didGovernanceRunFinish('auto_executing', 'failed'), true);
  assert.equal(didGovernanceRunFinish('succeeded', 'succeeded'), false);
  assert.equal(didGovernanceRunFinish(null, 'succeeded'), false);
});

test('exposes an independent Agent settings entry', async () => {
  const admin = await readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../src/pages/admin/AgentSettingsPage.tsx', import.meta.url), 'utf8');
  assert.match(admin, /path="agent" element={<AgentSettingsPage/);
  assert.match(admin, /Nav to="\/admin\/agent"/);
  assert.match(settings, /结构化文本模型/);
  assert.match(settings, /系统提示词/);
});
