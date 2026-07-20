import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../drizzle/0005_variable_suggestions.sql', import.meta.url);

test('suggestion prompt migration upgrades only untouched built-in prompts', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /text 变量必须生成 4-6 个 suggestions/);
  assert.match(sql, /select 变量生成 4-8 个严格 options/);
  assert.match(sql, /"updated_by" IS NULL/);
  assert.equal((sql.match(/AND "prompt" =/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /ON CONFLICT[\s\S]*DO UPDATE/i);
});
