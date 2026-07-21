import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('governance model input contains the administrator goal and deterministic signals', async () => {
  const source = await readFile(new URL('../src/ai-adapters.ts', import.meta.url), 'utf8');
  assert.match(source, /goal, snapshots, signals, taxonomyCatalog, rules/);
  assert.match(source, /buildGovernanceSignals/);
  assert.doesNotMatch(source, /signals: input\.signals \?\? \[\]/);
});
