import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("template deletion creates an approval request without direct mutation", async () => {
  const source = await readFile(
    new URL("../src/routes/templates.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /adminTemplateRoutes\.delete\('\/:id'/);
  assert.match(source, /createLifecycleApproval/);
  assert.match(source, /action: 'delete'/);
  assert.match(source, /status: 'awaiting_approval'/);
  const deleteRoute = source.slice(source.indexOf("adminTemplateRoutes.delete('/:id'"), source.indexOf("adminTemplateRoutes.post('/:id/publish'"));
  assert.doesNotMatch(deleteRoute, /deleteObject|delete\(promptTemplates\)/);
});

test('governance workspace supports one approval batch for explicit template deletion', async () => {
  const source = await readFile(new URL('../src/routes/templates.ts', import.meta.url), 'utf8');
  assert.match(source, /post\('\/deletion-requests\/preview', requireOwner/);
  assert.match(source, /post\('\/deletion-requests', requireOwner/);
  assert.match(source, /createLifecycleApprovalBatch/);
  assert.match(source, /templates: parsed\.data\.templateIds\.map/);
  assert.match(source, /status: 'awaiting_approval'/);
  assert.match(source, /ACTIVE_GOVERNANCE_WORK_EXISTS/);
});
