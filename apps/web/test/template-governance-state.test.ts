import assert from 'node:assert/strict';
import test from 'node:test';
import { changeGovernanceQuery, DEFAULT_GOVERNANCE_QUERY, GOVERNANCE_QUEUE_LABELS, parseGovernanceUrl, selectAllMatching, selectionCountCopy, serializeGovernanceUrl, toggleExplicitSelection } from '../src/lib/templateGovernanceState';

test('parses, serializes, and safely defaults governance URL state', () => {
  assert.equal(DEFAULT_GOVERNANCE_QUERY.queue, 'taxonomy_confirmation'); assert.equal(DEFAULT_GOVERNANCE_QUERY.sort, 'updated_desc');
  const state = parseGovernanceUrl(new URLSearchParams('queue=quality_issues&sort=quality_asc&source=manual&lifecycle=draft&scenarios=social,brand&selected=a&cursor=x'));
  assert.deepEqual(state.query.scenarios, ['social', 'brand']); assert.equal(state.selectedId, 'a');
  assert.equal(parseGovernanceUrl(serializeGovernanceUrl(state)).selectedId, 'a');
  assert.equal(parseGovernanceUrl(new URLSearchParams('queue=invalid')).query.queue, 'taxonomy_confirmation');
});

test('query changes reset cursor/detail and selection supports explicit or all matching', () => {
  const state = parseGovernanceUrl(new URLSearchParams('selected=a&cursor=x'));
  assert.deepEqual(changeGovernanceQuery(state, { quality: 'critical' }), { query: { ...state.query, quality: 'critical' }, selectedId: null, cursor: null });
  let selection = toggleExplicitSelection({ mode: 'explicit', templateIds: [], proposalIds: [] }, 'a'); selection = toggleExplicitSelection(selection, 'b'); selection = toggleExplicitSelection(selection, 'a');
  assert.deepEqual(selection.templateIds, ['b']);
  const all = selectAllMatching(state.query, '2026-07-21T00:00:00.000Z'); assert.equal(all.mode, 'query'); assert.deepEqual(all.exclusions, []);
  assert.equal(selectionCountCopy(all, 20, 125), '已选择全部 125 条匹配结果'); assert.equal(GOVERNANCE_QUEUE_LABELS.pending_approval, '等待审批');
});
