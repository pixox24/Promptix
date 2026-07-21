import { governanceTemplateQuerySchema, type GovernanceQueueId, type GovernanceTemplateQuery } from '@promptix/shared';
import type { GovernanceSelection } from '../types/templateGovernance';

export const DEFAULT_GOVERNANCE_QUERY: GovernanceTemplateQuery = { queue: 'taxonomy_confirmation', scenarios: [], styles: [], subjects: [], sort: 'updated_desc' };
const csv = (value: string | null) => value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];

export function parseGovernanceUrl(params: URLSearchParams) {
  const parsed = governanceTemplateQuerySchema.safeParse({ queue: params.get('queue') || undefined, q: params.get('q') || undefined, source: params.get('source') || undefined, lifecycle: params.get('lifecycle') || undefined, outputType: params.get('outputType') || undefined, scenarios: csv(params.get('scenarios')), styles: csv(params.get('styles')), subjects: csv(params.get('subjects')), quality: params.get('quality') || undefined, agentStatus: params.get('agentStatus') || undefined, updatedAfter: params.get('updatedAfter') || undefined, updatedBefore: params.get('updatedBefore') || undefined, sort: params.get('sort') || undefined });
  return { query: parsed.success ? { ...DEFAULT_GOVERNANCE_QUERY, ...parsed.data } : DEFAULT_GOVERNANCE_QUERY, selectedId: params.get('selected') || null, cursor: params.get('cursor') || null };
}

export function serializeGovernanceUrl(state: ReturnType<typeof parseGovernanceUrl>) {
  const params = new URLSearchParams(); const q = state.query;
  for (const [key, value] of Object.entries(q)) {
    if (Array.isArray(value) && value.length) params.set(key, value.join(',')); else if (typeof value === 'string' && value) params.set(key, value);
  }
  if (state.selectedId) params.set('selected', state.selectedId); if (state.cursor) params.set('cursor', state.cursor);
  return params;
}

export function changeGovernanceQuery(state: ReturnType<typeof parseGovernanceUrl>, patch: Partial<GovernanceTemplateQuery>) { return { query: { ...state.query, ...patch }, selectedId: null, cursor: null }; }
export function toggleExplicitSelection(selection: GovernanceSelection, id: string): GovernanceSelection {
  const ids = selection.mode === 'explicit' ? selection.templateIds : [];
  return { mode: 'explicit', templateIds: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id], proposalIds: [] };
}
export function selectAllMatching(query: GovernanceTemplateQuery, snapshotAt: string): GovernanceSelection { return { mode: 'query', query, exclusions: [], snapshotAt }; }
export function selectionCountCopy(selection: GovernanceSelection, pageCount: number, total: number) { return selection.mode === 'query' ? `已选择全部 ${total} 条匹配结果` : `已选择 ${selection.templateIds.length || pageCount} 条当前页结果`; }
export const GOVERNANCE_QUEUE_LABELS: Record<GovernanceQueueId, string> = { taxonomy_confirmation: '分类待确认', duplicate_candidates: '疑似重复', quality_issues: '质量问题', featured_candidates: '精选候选', pending_approval: '等待审批', failed_items: '失败与冲突' };
export const GOVERNANCE_REASON_LABELS: Record<string, string> = { TITLE_UNCLEAR: '标题不清晰', SUMMARY_UNCLEAR: '摘要不清晰', TAXONOMY_MISSING: '分类缺失', TAXONOMY_LOW_CONFIDENCE: '分类置信度低', TAXONOMY_UNMAPPED: '存在未映射分类', DUPLICATE_CANDIDATE: '疑似重复', QUALITY_ISSUE: '质量问题', FEATURED_CANDIDATE: '精选候选', VERSION_CONFLICT: '版本冲突', VALIDATION_FAILED: '校验失败' };
