import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { IngestJob } from '../types/ingest';

export function useIngestJob() {
  const [job, setJob] = useState<IngestJob>();
  const [connectionError, setConnectionError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (timer.current !== undefined) window.clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const next = await api<IngestJob>(`/api/admin/jobs/${id}`);
      setJob(next);
      setConnectionError('');
      if (['succeeded', 'failed', 'cancelled'].includes(next.status)) stop();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : '任务状态连接失败，正在重试');
    }
  }, [stop]);

  const track = useCallback((id: string) => {
    stop();
    void refresh(id);
    timer.current = window.setInterval(() => void refresh(id), 1500);
  }, [refresh, stop]);

  useEffect(() => stop, [stop]);

  const retry = useCallback(async () => {
    if (!job) return;
    await api(`/api/admin/jobs/${job.id}/retry`, { method: 'POST' });
    track(job.id);
  }, [job, track]);

  return { job, connectionError, track, retry };
}
