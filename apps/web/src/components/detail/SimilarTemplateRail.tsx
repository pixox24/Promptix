import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PromptTemplate } from '../../types/prompt';
import { SimilarTemplateCompactCard } from './SimilarTemplateCompactCard';

export function SimilarTemplateRail({
  templates,
  label,
  paged = false,
  pageSize = 2,
  className = '',
  onNavigateRequest,
}: {
  templates: PromptTemplate[];
  label: string;
  paged?: boolean;
  pageSize?: 1 | 2;
  className?: string;
  onNavigateRequest: (template: PromptTemplate, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(templates.length / pageSize));
  useEffect(() => setPage(0), [templates]);
  const visibleTemplates = paged ? templates.slice(page * pageSize, page * pageSize + pageSize) : templates;

  return <div className={`similar-template-rail-track ${className}`}>
    <aside className="similar-template-rail" aria-label={label}>
    <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
      <h2 className="text-xs font-semibold text-slate-600">相似模板</h2>
      {paged && pageCount > 1 && <div className="flex items-center gap-1.5"><span aria-live="polite" className="mr-0.5 text-[10px] tabular-nums text-slate-400">{page + 1}/{pageCount}</span><button type="button" aria-label="上一组相似模板" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white/75 text-slate-500 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"><ChevronUp size={14} /></button><button type="button" aria-label="下一组相似模板" disabled={page >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white/75 text-slate-500 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"><ChevronDown size={14} /></button></div>}
    </div>
    <div className="space-y-3">
      {visibleTemplates.map(template => <SimilarTemplateCompactCard key={template.id} template={template} onNavigateRequest={onNavigateRequest} />)}
    </div>
    </aside>
  </div>;
}
