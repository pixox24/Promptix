import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const src = new URL('../src/', import.meta.url);

test('admin exposes autopublish operations, exceptions and freeze control', async () => {
  const page = (await Promise.all([
    'pages/admin/AutopublishPage.tsx',
    'components/admin/autopublish/AutopublishOverview.tsx',
    'components/admin/autopublish/AutopublishExceptionList.tsx',
  ].map((path) => readFile(new URL(path, src), 'utf8')))).join('\n');
  for (const label of [
    '自动发布控制台',
    '当前运行',
    '异常队列',
    '观察中的模板',
    '用户委托',
    'Agent 主动',
    '总冻结',
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /nextAllowedActions/);
  assert.match(page, /shadow/);
  assert.match(page, /live/);
});

test('admin navigation registers the operations route', async () => {
  const admin = await readFile(new URL('pages/AdminPage.tsx', src), 'utf8');
  assert.match(admin, /AutopublishPage/);
  assert.match(admin, /\/admin\/autopublish/);
  assert.match(admin, /path="autopublish"/);
});

test('safety rejection never exposes ordinary recovery actions', async () => {
  const exceptions = await readFile(
    new URL('components/admin/autopublish/AutopublishExceptionList.tsx', src),
    'utf8',
  );
  assert.match(exceptions, /SAFETY_REJECTED/);
  assert.match(exceptions, /nextAllowedActions/);
});
