import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchGovernanceQueues, fetchGovernanceTemplate, fetchGovernanceTemplates } from '../data/templateGovernanceApi';
import { changeGovernanceQuery, parseGovernanceUrl, serializeGovernanceUrl, toggleExplicitSelection } from '../lib/templateGovernanceState';
import type { GovernanceQueueCount, GovernanceSelection, GovernanceTemplateDetail, GovernanceTemplatePage } from '../types/templateGovernance';
import type { GovernanceTemplateQuery } from '@promptix/shared';

export function useTemplateGovernance() {
  const [params, setParams] = useSearchParams(); const state = useMemo(() => parseGovernanceUrl(params), [params]);
  const [page, setPage] = useState<GovernanceTemplatePage | null>(null); const [queues, setQueues] = useState<GovernanceQueueCount[]>([]); const [detail, setDetail] = useState<GovernanceTemplateDetail | null>(null);
  const [selection, setSelection] = useState<GovernanceSelection>({ mode: 'explicit', templateIds: [], proposalIds: [] }); const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'filtered-empty' | 'offline' | 'forbidden' | 'conflict' | 'failed'>('loading');
  useEffect(() => { const controller = new AbortController(); setStatus('loading'); Promise.all([fetchGovernanceTemplates(serializeGovernanceUrl(state), controller.signal), fetchGovernanceQueues(controller.signal)]).then(([next, counts]) => { setPage(next); setQueues(counts); setStatus(next.items.length ? 'ready' : Object.keys(state.query).length > 1 ? 'filtered-empty' : 'empty'); }).catch((error) => { if (error.name !== 'AbortError') setStatus(error.status === 403 ? 'forbidden' : navigator.onLine ? 'failed' : 'offline'); }); return () => controller.abort(); }, [params.toString()]);
  useEffect(() => { if (!state.selectedId) { setDetail(null); return; } const controller = new AbortController(); fetchGovernanceTemplate(state.selectedId, controller.signal).then(setDetail).catch(() => setDetail(null)); return () => controller.abort(); }, [state.selectedId]);
  const updateQuery = (patch: Partial<GovernanceTemplateQuery>) => { setSelection({ mode: 'explicit', templateIds: [], proposalIds: [] }); setParams(serializeGovernanceUrl(changeGovernanceQuery(state, patch))); };
  return { state, page, queues, detail, status, selection, updateQuery, select: (id: string) => setParams(serializeGovernanceUrl({ ...state, selectedId: id })), toggleSelection: (id: string) => setSelection((current) => toggleExplicitSelection(current, id)), setSelection };
}
