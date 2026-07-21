import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('governance operations expose 30-day metrics and owner-only mutations', async () => {
  const route = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8');
  const auth = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
  assert.match(route, /get\('\/runs\/stats'/);
  for (const metric of ['successRate', 'avgDurationMs', 'rolledBack', 'awaitingApproval']) assert.match(route, new RegExp(metric));
  for (const path of ["'/rule-sets/active'", "'/agent-config'", "'/change-sets/:id/approve'", "'/change-sets/:id/reject'", "'/change-sets/:id/retry'", "'/change-sets/:id/rollback'"]) assert.match(route, new RegExp(`${path.replaceAll('/', '\\/')}.*, requireOwner`));
  assert.match(auth, /role !== 'owner' && role !== 'admin'/);
});
