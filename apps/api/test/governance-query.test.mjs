import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const queryModule = new URL('../dist/lib/governance-query.js', import.meta.url);

test('parses every governance filter and bounded page size', async () => {
  const { parseGovernancePageQuery } = await import(queryModule);
  const parsed = parseGovernancePageQuery(new URLSearchParams({
    queue: 'quality_issues', q: 'portrait', source: 'manual', lifecycle: 'draft',
    outputType: 'portrait', scenarios: 'social,brand', styles: 'minimal', subjects: 'person',
    quality: 'attention', agentStatus: 'planned', updatedAfter: '2026-07-01T00:00:00.000Z',
    updatedBefore: '2026-07-31T00:00:00.000Z', sort: 'updated_asc', pageSize: '100',
  }));
  assert.equal(parsed.pageSize, 100);
  assert.deepEqual(parsed.query.scenarios, ['social', 'brand']);
  assert.equal(parsed.query.agentStatus, 'planned');
  assert.throws(() => parseGovernancePageQuery(new URLSearchParams({ pageSize: '101' })), /pageSize/);
  assert.throws(() => parseGovernancePageQuery(new URLSearchParams({ queue: 'unknown' })), /Invalid enum/);
});

test('opaque cursors round-trip and reject malformed values', async () => {
  const { encodeGovernanceCursor, decodeGovernanceCursor } = await import(queryModule);
  const value = { updatedAt: '2026-07-21T00:00:00.000Z', id: 'template-a' };
  const encoded = encodeGovernanceCursor(value);
  assert.doesNotMatch(encoded, /template-a/);
  assert.deepEqual(decodeGovernanceCursor(encoded), value);
  assert.throws(() => decodeGovernanceCursor('not-a-cursor'), /Invalid cursor/);
});

test('queries use shared queue predicates, stable id ordering, and safe projections', async () => {
  const querySource = await readFile(new URL('../src/lib/governance-query.ts', import.meta.url), 'utf8');
  const toolsSource = await readFile(new URL('../src/lib/governance-tools.ts', import.meta.url), 'utf8');
  const routeSource = await readFile(new URL('../src/routes/governance.ts', import.meta.url), 'utf8');
  for (const queue of ['taxonomy_confirmation', 'duplicate_candidates', 'quality_issues', 'featured_candidates', 'pending_approval', 'failed_items']) {
    assert.match(querySource, new RegExp(`case '${queue}'`));
  }
  assert.match(querySource, /asc\(promptTemplates\.id\)|desc\(promptTemplates\.id\)/);
  assert.match(routeSource, /search_templates\(parsed\)/);
  assert.match(routeSource, /search_templates\(\{ query: \{ queue: id/);
  assert.match(toolsSource, /currentSnapshot/);
  assert.match(toolsSource, /activeProposal/);
  assert.match(toolsSource, /confidence/);
  assert.match(toolsSource, /history/);
  assert.match(toolsSource, /approval/);
  assert.doesNotMatch(toolsSource, /apiKeyEncrypted|apiKeyEnv|generationJobs\.input/);
});

test('captured query scopes cannot include templates changed after submission', async () => {
  const { capturedGovernanceQuery } = await import(new URL('../dist/lib/governance-run-preparation.js', import.meta.url));
  const query = { scenarios: [], styles: [], subjects: [], sort: 'updated_desc' };
  assert.equal(capturedGovernanceQuery(query, '2026-07-21T10:00:00.000Z').updatedBefore, '2026-07-21T10:00:00.000Z');
  assert.equal(capturedGovernanceQuery({ ...query, updatedBefore: '2026-07-20T10:00:00.000Z' }, '2026-07-21T10:00:00.000Z').updatedBefore, '2026-07-20T10:00:00.000Z');
});
