import type { SimilarTemplateItem } from '@promptix/shared';
import type { PromptTemplate } from './prompt';

export type SimilarTemplateViewItem =
  Omit<SimilarTemplateItem, 'template'> & { template: PromptTemplate };

export type SimilarTemplateViewResult = {
  items: SimilarTemplateViewItem[];
  requestId: string | null;
  algorithmVersion: 'similar-v1' | null;
  source: 'server' | 'fallback';
  loading: boolean;
  unavailable: boolean;
};

export type RecommendationCardMeta = {
  sourceTemplateId: string;
  requestId: string;
  item: SimilarTemplateViewItem;
};
