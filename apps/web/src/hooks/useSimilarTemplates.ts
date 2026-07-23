import { useEffect, useState } from 'react';
import { fetchSimilarTemplates } from '../data/templateApi';
import { getSimilarTemplates } from '../data/templates';
import type { PromptTemplate } from '../types/prompt';
import type {
  SimilarTemplateViewItem,
  SimilarTemplateViewResult,
} from '../types/recommendation';

function fallbackResult(template: PromptTemplate): SimilarTemplateViewResult {
  return {
    items: getSimilarTemplates(template, 4).map((candidate, index) => ({
      template: candidate,
      score: 0,
      position: index + 1,
      reasonCodes: ['popular'],
      reasonLabel: '你可能也喜欢',
    })),
    requestId: null,
    algorithmVersion: null,
    source: 'fallback',
    loading: false,
  };
}

export function useSimilarTemplates(template: PromptTemplate | undefined) {
  const [result, setResult] = useState<SimilarTemplateViewResult>({
    items: [],
    requestId: null,
    algorithmVersion: null,
    source: 'fallback',
    loading: Boolean(template),
  });

  useEffect(() => {
    if (!template) {
      setResult({
        items: [],
        requestId: null,
        algorithmVersion: null,
        source: 'fallback',
        loading: false,
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
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('similar template request failed; using fallback', error);
        setResult(fallbackResult(template));
      });
    return () => controller.abort();
  }, [template]);

  return result;
}
