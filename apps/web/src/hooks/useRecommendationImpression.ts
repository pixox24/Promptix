import { useEffect, useRef } from 'react';
import { recordRecommendationEvent } from '../data/templateApi';

const reportedImpressions = new Set<string>();

export function useRecommendationImpression(
  sourceTemplateId: string,
  recommendedTemplateId: string,
  requestId: string | null,
) {
  const elementRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !requestId) return;
    const dedupeKey = `${requestId}:${recommendedTemplateId}`;
    if (reportedImpressions.has(dedupeKey)) return;

    let visibleTimer: number | undefined;
    const cancelTimer = () => {
      window.clearTimeout(visibleTimer);
      visibleTimer = undefined;
    };
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.5) {
        cancelTimer();
        return;
      }
      if (visibleTimer !== undefined) return;
      visibleTimer = window.setTimeout(() => {
        visibleTimer = undefined;
        if (reportedImpressions.has(dedupeKey)) return;
        reportedImpressions.add(dedupeKey);
        void recordRecommendationEvent(sourceTemplateId, {
          requestId,
          eventType: 'impression',
          recommendedTemplateId,
        }).catch((error: unknown) => {
          console.warn('recommendation impression failed', error);
        });
      }, 1000);
    }, { threshold: 0.5 });

    observer.observe(element);
    return () => {
      cancelTimer();
      observer.disconnect();
    };
  }, [recommendedTemplateId, requestId, sourceTemplateId]);

  return elementRef;
}

