import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin templates route renders the three-column governance workspace', async () => {
  const admin = await readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/pages/admin/TemplateGovernancePage.tsx', import.meta.url), 'utf8');
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
