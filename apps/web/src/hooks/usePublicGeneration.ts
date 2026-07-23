import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicGenerationCreate, PublicGenerationJob } from '@promptix/shared';
import { createGeneration, getGeneration, retryGeneration } from '../components/detail/generationApi';
import { ApiError } from '../lib/api';

export function usePublicGeneration(
  onSuccess: (job: PublicGenerationJob) => void,
  onRecommendationInvalid?: () => void,
) {
  const [job, setJob] = useState<PublicGenerationJob | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const poll = useCallback(async (current: PublicGenerationJob) => {
    if (!current.accessToken || !['pending', 'running'].includes(current.status)) return;
    try {
      const next = await getGeneration(current.id, current.accessToken);
      const merged = { ...next, accessToken: current.accessToken };
      setJob(merged);
      if (merged.status === 'succeeded') onSuccess(merged);
      else if (merged.status === 'failed') setError(merged.error?.message ?? '生成失败，请重试');
      else timer.current = window.setTimeout(() => void poll(merged), 1500);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法获取生成状态'); }
  }, [onSuccess]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const create = useCallback(async (input: PublicGenerationCreate) => {
    window.clearTimeout(timer.current); setError('');
    try {
      let next;
      try {
        next = await createGeneration(input);
      } catch (reason) {
        if (
          reason instanceof ApiError &&
          reason.code === 'RECOMMENDATION_REQUEST_INVALID' &&
          input.recommendationRequestId
        ) {
          onRecommendationInvalid?.();
          const { recommendationRequestId: _ignored, ...withoutAttribution } = input;
          next = await createGeneration(withoutAttribution);
        } else {
          throw reason;
        }
      }
      setJob(next);
      void poll(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建生成任务失败');
    }
  }, [onRecommendationInvalid, poll]);
  const retry = useCallback(async () => {
    if (!job?.accessToken) return;
    setError('');
    try { const next = await retryGeneration(job.id, job.accessToken); const merged = { ...next, accessToken: job.accessToken }; setJob(merged); void poll(merged); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重试失败'); }
  }, [job, poll]);
  return { job, error, create, retry, busy: job?.status === 'pending' || job?.status === 'running', clear: () => { window.clearTimeout(timer.current); setJob(null); setError(''); } };
}
