import { useCallback, useEffect, useRef, useState } from 'react';
import { getAutopublishRun } from '../data/autopublishApi';
import { shouldPollAutopublishRun, type AutopublishRunView } from '../types/autopublish';

const POLL_MS = 1_500;

export function useAutopublishRun(runId: string | null) {
  const [run, setRun] = useState<AutopublishRunView | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const previousStage = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!runId) return null;
    try {
      const next = await getAutopublishRun(runId);
      setRun(next);
      setError(null);
      if (previousStage.current && previousStage.current !== next.currentStage) {
        setAnnouncement(`自动发布已进入 ${next.currentStage} 阶段`);
      }
      previousStage.current = next.currentStage;
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      return null;
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setError(null);
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await refresh();
      if (!disposed && next && shouldPollAutopublishRun(next.status)) {
        timer = setTimeout(poll, POLL_MS);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh, runId]);

  return { run, error, refresh, announcement };
}
