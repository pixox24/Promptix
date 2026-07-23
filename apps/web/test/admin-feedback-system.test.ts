import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('toast uses explicit durations, deduplication and accessible live-region roles', async () => {
  const source = await read('../src/context/ToastContext.tsx');
  assert.match(source, /TOAST_DURATION_MS/);
  assert.match(source, /prev\.filter\(\(item\) => item\.message !== message\)/);
  assert.match(source, /item\.type === 'error' \? 'alert' : 'status'/);
  assert.match(source, /aria-atomic="true"/);
});

test('inline alerts are typed and never infer severity from message text', async () => {
  const source = await read('../src/components/feedback/InlineAlert.tsx');
  assert.match(source, /InlineAlertType = 'success' \| 'info' \| 'warning' \| 'error'/);
  assert.match(source, /type === 'error' \? 'alert' : 'status'/);
  assert.doesNotMatch(source, /includes\(/);
});

test('template publish confirmation is sent through the global toast', async () => {
  const source = await read('../src/pages/AdminPage.tsx');
  assert.match(source, /toast\("发布请求已提交审批", "success"\)/);
  assert.doesNotMatch(source, /text\.includes\("成功"\) \|\| text\.includes\("已"\)/);
});

test('provider model feedback no longer guesses severity from translated copy', async () => {
  const source = await read('../src/pages/admin/ProviderModelsPage.tsx');
  assert.doesNotMatch(source, /const error=\/.*失败/);
  assert.doesNotMatch(source, /message\.includes/);
});

