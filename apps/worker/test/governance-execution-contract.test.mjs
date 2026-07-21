import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('governance execution audits apply, permanent delete, and rollback', async () => {
  const source = await readFile(new URL('../src/governance-job-execution.ts', import.meta.url), 'utf8');
  for (const event of ['governance.template_applied', 'governance.template_deleted', 'governance.template_rolled_back', 'governance.change_set_execution_finished']) assert.match(source, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(source, /permanent: true/);
  assert.doesNotMatch(source, /DELETE_EXECUTION_NOT_SUPPORTED/);
});
