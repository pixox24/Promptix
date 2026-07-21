import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPageUrl = new URL("../src/pages/AdminPage.tsx", import.meta.url);

test("template editor sends optimistic version and idempotency data", async () => {
  const source = await readFile(adminPageUrl, "utf8");
  assert.match(source, /currentVersion: number/);
  assert.match(source, /expectedVersion: existing\?\.currentVersion/);
  assert.match(source, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(source, /body\.set\("expectedVersion"/);
  assert.match(source, /body\.set\("idempotencyKey"/);
});

test("version conflicts preserve local edits and explain recovery", async () => {
  const source = await readFile(adminPageUrl, "utf8");
  assert.match(source, /e\.code === "VERSION_CONFLICT"/);
  assert.match(source, /本地编辑仍保留/);
  assert.match(source, /刷新页面核对最新版本/);
});
