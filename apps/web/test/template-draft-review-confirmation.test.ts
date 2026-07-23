import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('new template drafts start with taxonomy confirmation selected', async () => {
  const source = await readFile(
    new URL('../src/components/admin/ingest/TemplateDraftReview.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /const \[confirmed, setConfirmed\] = useState\(true\)/);
  assert.match(source, /checked=\{confirmed\}/);
  assert.match(source, /onChange=\{\(event\) => setConfirmed\(event\.target\.checked\)\}/);
});
