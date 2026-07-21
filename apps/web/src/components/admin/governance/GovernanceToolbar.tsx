import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GovernanceTemplateQuery } from '@promptix/shared';

const field = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-violet-500';

export function GovernanceToolbar({ query, total, onChange }: { query: GovernanceTemplateQuery; total: number; onChange: (patch: Partial<GovernanceTemplateQuery>) => void }) {
  const [search, setSearch] = useState(query.q ?? '');
  useEffect(() => setSearch(query.q ?? ''), [query.q]);
  useEffect(() => { const timer = window.setTimeout(() => { if (search.trim() !== (query.q ?? '')) onChange({ q: search.trim() || undefined }); }, 350); return () => window.clearTimeout(timer); }, [search, query.q, onChange]);
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
    <label className="relative min-w-52 flex-1"><Search size={14} className="absolute left-2.5 top-2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${field} w-full pl-8`} placeholder="搜索名称、摘要或 Prompt"/></label>
    <select aria-label="来源" className={field} value={query.source ?? ''} onChange={(event) => onChange({ source: (event.target.value || undefined) as GovernanceTemplateQuery['source'] })}><option value="">全部来源</option><option value="manual">手工</option><option value="image_reverse">图片反推</option><option value="text_expand">文本扩写</option></select>
    <select aria-label="生命周期" className={field} value={query.lifecycle ?? ''} onChange={(event) => onChange({ lifecycle: (event.target.value || undefined) as GovernanceTemplateQuery['lifecycle'] })}><option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select>
    <select aria-label="质量" className={field} value={query.quality ?? ''} onChange={(event) => onChange({ quality: (event.target.value || undefined) as GovernanceTemplateQuery['quality'] })}><option value="">全部质量</option><option value="critical">严重</option><option value="attention">需关注</option><option value="good">良好</option></select>
    <select aria-label="排序" className={field} value={query.sort} onChange={(event) => onChange({ sort: event.target.value as GovernanceTemplateQuery['sort'] })}><option value="updated_desc">最近更新</option><option value="updated_asc">最早更新</option><option value="quality_asc">质量优先</option><option value="confidence_desc">置信度</option></select>
    <span className="ml-auto text-xs tabular-nums text-slate-500">{total} 项</span>
  </div>;
}
