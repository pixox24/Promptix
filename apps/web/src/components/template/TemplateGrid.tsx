import type { MouseEvent } from 'react';
import type { PromptTemplate } from '../../types/prompt';
import { EmptyState } from '../ui/EmptyState';
import { TemplateCardSkeleton } from '../ui/Skeleton';
import { IconSearch } from '../icons';
import { TemplateCard } from './TemplateCard';

interface TemplateGridProps {
  templates: PromptTemplate[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  density?: 'dense' | 'comfortable';
  onNavigateRequest?: (template: PromptTemplate, event: MouseEvent<HTMLAnchorElement>) => void;
}

/** HeroPrompt: grid-cols-1 sm:2 lg:3 xl:4 2xl:5 gap-[2px] */
export function TemplateGrid({
  templates,
  loading,
  emptyTitle = '没有找到匹配的模板',
  emptyDescription = '试试调整关键词或筛选条件。',
  onNavigateRequest,
}: TemplateGridProps) {
  if (loading) {
    return (
<div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <TemplateCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<IconSearch size={22} />}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel="清除筛选"
        actionTo="/"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} onNavigateRequest={onNavigateRequest} />
      ))}
    </div>
  );
}
