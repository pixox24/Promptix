import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('image reverse upload supports clipboard paste through event and command button', async () => {
  const source = await readFile(new URL('../src/components/admin/ingest/ImageReverseFlow.tsx', import.meta.url), 'utf8');

  assert.match(source, /onPaste=\{\(event\)/);
  assert.match(source, /event\.clipboardData\.items/);
  assert.match(source, /navigator\.clipboard\?\.read/);
  assert.match(source, /item\.types\.find\(\(candidate\) => candidate\.startsWith\('image\/'\)\)/);
  assert.match(source, /acceptFile\(new File/);
  assert.match(source, /剪贴板中没有图片/);
  assert.match(source, /未获得剪贴板权限/);
  assert.match(source, /从剪贴板粘贴/);
  assert.match(source, /status !== 'queued' && status !== 'running'/);
});
