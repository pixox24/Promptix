import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("archived templates expose a confirmed permanent-delete action", async () => {
  const source = await readFile(
    new URL("../src/pages/AdminPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /t\.status === "archived"/);
  assert.match(source, /title: "永久删除模板？"/);
  assert.match(source, /confirmLabel: "永久删除"/);
  assert.match(source, /danger: true/);
  assert.match(
    source,
    /api\(`\/api\/admin\/templates\/\$\{template\.id\}`,[\s\S]*?method: "DELETE"/,
  );
  assert.match(source, /已发布模板必须先下架，才能永久删除/);
});
