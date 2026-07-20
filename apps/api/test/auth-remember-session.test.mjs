import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('remember login controls whether the auth cookie persists', async () => {
  const route = await readFile(new URL('../src/routes/auth.ts', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');

  assert.match(route, /remember: z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.match(route, /setAuthCookie\(c, token, parsed\.data\.remember\)/);
  assert.match(auth, /remember \? \{ maxAge: 60 \* 60 \* 24 \* 7 \} : \{\}/);
});
