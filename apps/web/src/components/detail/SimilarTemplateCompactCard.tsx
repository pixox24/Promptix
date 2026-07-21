import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PromptTemplate } from '../../types/prompt';

export function SimilarTemplateCompactCard({
  template,
  onNavigateRequest,
}: {
  template: PromptTemplate;
  onNavigateRequest: (template: PromptTemplate, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return <Link
    to={`/template/${template.id}`}
    className="similar-template-card group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
    onClick={event => onNavigateRequest(template, event)}
  >
    <article className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/70 bg-slate-200 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg">
      <img src={template.coverImage} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.hidden=true}} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-focus-visible:scale-[1.025]" />
      <div className="similar-template-card-overlay pointer-events-none absolute inset-x-0 bottom-0 flex h-[44%] items-end bg-gradient-to-t from-black/80 via-black/35 to-transparent p-4 opacity-0 transition-opacity duration-200">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-white drop-shadow-sm">{template.name}</h3>
      </div>
    </article>
  </Link>;
}
