import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchGovernanceRun, fetchGovernanceRuns } from '../data/templateGovernanceApi';
import type { GovernanceRunDetail, GovernanceRunSummary } from '../types/templateGovernance';

const ACTIVE = new Set(['queued', 'analyzing', 'planned', 'auto_executing']);

export function didGovernanceRunFinish(previous: string | null, next: string) {
  return Boolean(previous && ACTIVE.has(previous) && !ACTIVE.has(next));
}

export function useGovernanceRuns(onTerminal?: () => void) {
  const [runs, setRuns] = useState<GovernanceRunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GovernanceRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const statusByRun = useRef(new Map<string, string>());

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await fetchGovernanceRuns(signal);
      setRuns(result.items);
      setError('');
      return result.items;
    } catch (value) {
      if ((value as Error).name !== 'AbortError') setError(value instanceof Error ? value.message : '运行记录加载失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let previousStatus = statusByRun.current.get(selectedId) ?? null;
    const controller = new AbortController();
    const load = async () => {
      try {
        const next = await fetchGovernanceRun(selectedId, controller.signal);
        setDetail(next);
        setRuns((current) => current.map((run) => run.id === next.id ? { ...run, ...next } : run));
        if (didGovernanceRunFinish(previousStatus, next.status)) onTerminal?.();
        previousStatus = next.status;
        statusByRun.current.set(next.id, next.status);
      } catch (value) {
        if ((value as Error).name !== 'AbortError') setError(value instanceof Error ? value.message : '运行详情加载失败');
      }
    };
    void load();
    const timer = window.setInterval(() => { if (!previousStatus || ACTIVE.has(previousStatus)) void load(); }, 2500);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selectedId, onTerminal]);

  const activeRun = useMemo(() => runs.find((run) => ACTIVE.has(run.status)) ?? null, [runs]);
  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [activeRun, refresh]);

  return {
    runs, detail, selectedId, loading, error, activeRun,
    selectRun: setSelectedId,
    trackRun: (run: GovernanceRunSummary) => { statusByRun.current.set(run.id, run.status); setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]); setSelectedId(run.id); },
    refresh: () => refresh(),
  };
}
