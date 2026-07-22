import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchGovernanceQueues, fetchGovernanceTemplate, fetchGovernanceTemplates } from '../data/templateGovernanceApi';
import { changeGovernanceQuery, parseGovernanceUrl, selectAllMatching, serializeGovernanceUrl, toggleExplicitSelection } from '../lib/templateGovernanceState';
import type { GovernanceQueueCount, GovernanceSelection, GovernanceTemplateDetail, GovernanceTemplatePage } from '../types/templateGovernance';
import type { GovernanceTemplateQuery } from '@promptix/shared';

export function useTemplateGovernance() {
  const [params, setParams] = useSearchParams(); const state = useMemo(() => parseGovernanceUrl(params), [params]);
  const requestKey = params.toString();
  const [page, setPage] = useState<GovernanceTemplatePage | null>(null); const [queues, setQueues] = useState<GovernanceQueueCount[]>([]); const [detail, setDetail] = useState<GovernanceTemplateDetail | null>(null);
  const [selection, setSelection] = useState<GovernanceSelection>({ mode: 'explicit', templateIds: [], proposalIds: [] }); const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'filtered-empty' | 'offline' | 'forbidden' | 'conflict' | 'failed'>('loading');
  const [reloadKey, setReloadKey] = useState(0); const [error, setError] = useState('');
  useEffect(() => { const requestState = parseGovernanceUrl(new URLSearchParams(requestKey)); const controller = new AbortController(); setStatus('loading'); Promise.all([fetchGovernanceTemplates(serializeGovernanceUrl(requestState), controller.signal), fetchGovernanceQueues(controller.signal)]).then(([next, counts]) => { setPage(next); setQueues(counts); setError(''); setStatus(next.items.length ? 'ready' : Object.keys(requestState.query).length > 1 ? 'filtered-empty' : 'empty'); }).catch((value) => { if (value.name !== 'AbortError') { setError(value instanceof Error ? value.message : '治理工作台加载失败'); setStatus(value.status === 403 ? 'forbidden' : value.status === 409 ? 'conflict' : navigator.onLine ? 'failed' : 'offline'); } }); return () => controller.abort(); }, [requestKey, reloadKey]);
  useEffect(() => {
    if (!state.selectedId) { setDetail(null); return; }
    const controller = new AbortController(); let timer: number | undefined;
    const active = new Set(['planned', 'accepted', 'awaiting_approval', 'approved']);
    const load = async () => {
      try {
        const next = await fetchGovernanceTemplate(state.selectedId!, controller.signal); setDetail(next);
        const changeStatus = next.approval?.changeSet?.status;
        if (active.has(next.activeProposal?.status ?? '') || ['planned', 'auto_executing', 'approved'].includes(changeStatus ?? '')) timer = window.setTimeout(load, 2500);
      } catch { if (!controller.signal.aborted) setDetail(null); }
    };
    void load(); return () => { controller.abort(); if (timer) window.clearTimeout(timer); };
  }, [state.selectedId, reloadKey]);
  const updateQuery = (patch: Partial<GovernanceTemplateQuery>) => { setSelection({ mode: 'explicit', templateIds: [], proposalIds: [] }); setParams(serializeGovernanceUrl(changeGovernanceQuery(state, patch))); };
  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
  const pageIds = page?.items.map((item) => item.id) ?? [];
  return { state, page, queues, detail, status, error, selection, updateQuery, select: (id: string) => setParams(serializeGovernanceUrl({ ...state, selectedId: id })), toggleSelection: (id: string) => setSelection((current) => toggleExplicitSelection(current, id)), togglePage: () => setSelection((current) => {
    if (current.mode === 'query') {
      const all = pageIds.length > 0 && pageIds.every((id) => !current.exclusions.includes(id));
      return { ...current, exclusions: all ? [...new Set([...current.exclusions, ...pageIds])] : current.exclusions.filter((id) => !pageIds.includes(id)) };
    }
    const selected = new Set(current.templateIds); const all = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    return { mode: 'explicit', templateIds: all ? [...selected].filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])], proposalIds: [] };
  }), selectAll: () => setSelection(selectAllMatching(state.query, page?.querySnapshot.capturedAt ?? new Date().toISOString())), setSelection, nextPage: () => page?.nextCursor && setParams(serializeGovernanceUrl({ ...state, cursor: page.nextCursor, selectedId: null })), firstPage: () => setParams(serializeGovernanceUrl({ ...state, cursor: null, selectedId: null })), refresh };
}
