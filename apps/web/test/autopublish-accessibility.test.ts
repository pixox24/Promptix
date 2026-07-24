import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const src = new URL('../src/', import.meta.url);

test('autopublish progress has a polite atomic announcement and ordered stages', async () => {
  const card = await readFile(new URL('components/admin/autopublish/AutopublishRunCard.tsx', src), 'utf8');
  assert.match(card, /role="status"/);
  assert.match(card, /aria-live="polite"/);
  assert.match(card, /aria-atomic="true"/);
  assert.match(card, /<ol/);
});

test('mode controls expose their pressed state and freeze action is explicit', async () => {
  const page = await readFile(new URL('pages/admin/AutopublishPage.tsx', src), 'utf8');
  assert.match(page, /aria-pressed=\{mode === 'shadow'\}/);
  assert.match(page, /aria-pressed=\{mode === 'live'\}/);
  assert.match(page, /确认总冻结自动发布/);
});
