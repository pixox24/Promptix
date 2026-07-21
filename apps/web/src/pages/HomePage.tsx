import { useState } from 'react';
import { FilterSidebar, MobileFilterBar } from '../components/browse/FilterSidebar';
import { TemplateGrid } from '../components/template/TemplateGrid';
import { useTemplateBrowse } from '../hooks/useTemplateBrowse';

export function HomePage() {
  const browse = useTemplateBrowse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarProps = {
    query: browse.query,
    onQueryChange: browse.setQuery,
    hasQuery: browse.hasQuery,
    sort: browse.sort,
    onSortChange: browse.setSort,
    taxonomyTerms: browse.taxonomyTerms,
    outputType: browse.outputType,
    onOutputTypeChange: (value: string) => browse.update({ outputType: value || null }),
    scenarios: browse.scenarios,
    styles: browse.styles,
    subjects: browse.subjects,
    onToggleTaxonomy: browse.toggle,
    onClearTaxonomy: (dimension: 'scenarios' | 'styles' | 'subjects') => browse.update({ [dimension]: null }),
  };
  return <div className="mx-auto max-w-[1920px] px-4 pb-12 md:px-8">
    <div className="flex flex-col items-start gap-6 md:flex-row md:gap-5">
      <MobileFilterBar {...sidebarProps} open={mobileOpen} onOpenChange={setMobileOpen} />
      <FilterSidebar {...sidebarProps} />
      <div className="min-w-0 flex-1 [overflow-anchor:none]">
        {browse.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{browse.error}</div>}
        <TemplateGrid templates={browse.templates} loading={browse.loading} emptyTitle="没有找到匹配的提示词" emptyDescription="试试调整搜索关键词或取消部分筛选条件。" />
        {browse.total > 24 && <div className="mt-6 flex items-center justify-center gap-3"><button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={browse.page <= 1} onClick={() => browse.update({ page: String(browse.page - 1) })}>上一页</button><span className="text-sm text-slate-500">第 {browse.page} 页</span><button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={browse.page * 24 >= browse.total} onClick={() => browse.update({ page: String(browse.page + 1) })}>下一页</button></div>}
      </div>
    </div>
  </div>;
}
