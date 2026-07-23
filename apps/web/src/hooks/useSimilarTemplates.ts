import { useEffect, useState } from 'react';
import { fetchSimilarTemplates } from '../data/templateApi';
import type { PromptTemplate } from '../types/prompt';
import type {
  SimilarTemplateViewItem,
  SimilarTemplateViewResult,
} from '../types/recommendation';

export function useSimilarTemplates(template: PromptTemplate | undefined) {
  const [result, setResult] = useState<SimilarTemplateViewResult>({
    items: [],
    requestId: null,
    algorithmVersion: null,
    source: 'fallback',
    loading: Boolean(template),
    unavailable: false,
  });

  useEffect(() => {
    if (!template) {
      setResult({
        items: [],
        requestId: null,
        algorithmVersion: null,
        source: 'fallback',
        loading: false,
        unavailable: false,
      });
      return;
    }

    const controller = new AbortController();
    setResult((current) => ({ ...current, loading: true }));
    fetchSimilarTemplates(template.id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setResult({
          items: response.items as SimilarTemplateViewItem[],
          requestId: response.requestId,
          algorithmVersion: response.algorithmVersion,
          source: 'server',
          loading: false,
          unavailable: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('similar template request failed', error);
        setResult({
          items: [],
          requestId: null,
          algorithmVersion: null,
          source: 'fallback',
          loading: false,
          unavailable: true,
        });
      });
    return () => controller.abort();
  }, [template]);

  return result;
}
