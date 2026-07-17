import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourcePath = new URL('../src/components/browse/FilterSidebar.tsx', import.meta.url);

test('keeps the desktop search before the scrolling filter body', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const searchPlaceholder =
    'placeholder="搜索标题、描述、提示词..."';
  const scrollBody = source.indexOf('sidebar-scroll relative z-10 flex-1');

  assert.ok(scrollBody >= 0, 'desktop filter body should exist');

  const desktopHeader = source.slice(0, scrollBody);
  const desktopSearch = desktopHeader.indexOf(searchPlaceholder);
  const desktopSearchCount = desktopHeader.split(searchPlaceholder).length - 1;

  assert.equal(
    desktopSearchCount,
    1,
    'desktop header should contain exactly one search input',
  );
  assert.ok(desktopSearch >= 0, 'desktop search input should exist');
  assert.ok(
    desktopSearch < scrollBody,
    'desktop search should appear before the scroll body',
  );
});
