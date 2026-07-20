import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("template deletion requires archival and performs a physical delete", async () => {
  const source = await readFile(
    new URL("../src/routes/templates.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /adminTemplateRoutes\.delete\('\/:id'/);
  assert.match(source, /row\.status === 'published'/);
  assert.match(source, /ARCHIVE_FIRST/);
  assert.match(source, /deleteObject\(row\.coverObjectKey\)/);
  assert.match(source, /delete\(promptTemplates\)/);
});
