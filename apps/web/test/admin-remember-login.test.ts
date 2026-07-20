import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin login exposes an opt-in persistent session without storing the password', async () => {
  const source = await readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8');

  assert.match(source, /type="checkbox"[\s\S]*?checked=\{remember\}/);
  assert.match(source, /JSON\.stringify\(\{\s*email\s*,\s*password\s*,\s*remember\s*\}\)/);
  assert.match(source, /promptix_admin_email/);
  assert.doesNotMatch(source, /setItem\([^\n]*password/);
  assert.match(source, /autoComplete="current-password"/);
});
