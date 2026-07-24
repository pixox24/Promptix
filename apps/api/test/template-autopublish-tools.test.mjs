import assert from 'node:assert/strict';
import test from 'node:test';

test('Agent tools expose only the approved capabilities', async () => {
  const tools = await import(new URL('../dist/lib/autopublish-tools.js', import.meta.url));
  const names = Object.keys(tools).filter((key) => key.endsWith('Tool')).sort();
  assert.deepEqual(names, [
    'cancelAutopublishRunTool',
    'getAutopublishRunTool',
    'listAutopublishExceptionsTool',
    'startAutopublishRunTool',
  ]);
});

test('scheduled Agent cannot scan an unapproved source or increase budget', async () => {
  const { startAutopublishRunTool } = await import(new URL('../dist/lib/autopublish-tools.js', import.meta.url));
  const context = {
    allowedSourceTypes: ['curated_queue'],
    grant: { id: 'grant-1' },
    service: { async create(value) { return value; } },
  };
  const input = {
    flowType: 'text_expand', triggerType: 'scheduled_agent', text: 'portrait',
    sourceType: 'curated_queue', sourceItemId: 'item-1',
    idempotencyKey: 'scheduled-item-1',
  };
  await assert.rejects(() => startAutopublishRunTool({ ...input, sourceType: 'open_web' }, context), /AUTOPUBLISH_SOURCE_FORBIDDEN/);
  await assert.rejects(() => startAutopublishRunTool({ ...input, budget: { maximumModelCalls: 99 } }, context), /AUTOPUBLISH_BUDGET_OVERRIDE_FORBIDDEN/);
});
