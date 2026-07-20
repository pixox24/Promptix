import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FilterSidebar,
  MobileFilterBar,
} from '../components/browse/FilterSidebar';
import { TemplateGrid } from '../components/template/TemplateGrid';
import { templates as staticTemplates } from '../data/templates';
import { fetchTemplates } from '../data/templateApi';
import type { PromptTemplate } from '../types/prompt';
import type { SortOption } from '../types/prompt';
import { TEMPLATE_USE_SCENARIOS } from '@promptix/shared';
import { compareTemplates } from '../lib/templateRanking';

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);

  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as SortOption) || 'hot';
  const tagsParam = params.get('tags') ?? '';
  const selectedTags = useMemo(() => tagsParam ? tagsParam.split(',').filter(Boolean) : [], [tagsParam]);

  useEffect(() => {
    setLoading(true);
    let active = true;
    fetchTemplates().then((items) => { if (active) setTemplates(items); })
      .catch(() => { if (active) setTemplates(staticTemplates); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!templates.length) return;
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 120);
    return () => window.clearTimeout(t);
  }, [query, sort, tagsParam, templates.length]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    setParams(next, { replace: true });
  };

  const onToggleTag = (tag: string) => {
    const set = new Set(selectedTags);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    const list = Array.from(set);
    update({ tags: list.length ? list.join(',') : null });
  };

  const onClearScenarios = () => {
    const scenarios = new Set<string>(TEMPLATE_USE_SCENARIOS);
    const remaining = selectedTags.filter((tag) => !scenarios.has(tag));
    update({ tags: remaining.length ? remaining.join(',') : null });
  };

  const filtered = useMemo(() => {
    let list = [...templates];

    if (query.trim()) {
      const kw = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(kw) ||
          t.summary.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw) ||
          t.tags.some((x) => x.toLowerCase().includes(kw)) ||
          t.promptTemplate.toLowerCase().includes(kw),
      );
    }

    if (selectedTags.length) {
      list = list.filter((t) =>
        selectedTags.some(
          (tag) =>
            t.tags.includes(tag) ||
            t.scenarios.some((s) => s.includes(tag)) ||
            t.summary.includes(tag),
        ),
      );
    }

    list.sort(compareTemplates(sort));

    return list;
  }, [query, sort, selectedTags, templates]);

  const sidebarProps = {
    query,
    onQueryChange: (q: string) => update({ q: q || null }),
    sort,
    onSortChange: (s: SortOption) => update({ sort: s === 'hot' ? null : s }),
    selectedTags,
    onToggleTag,
    onClearScenarios,
  };

  return (
    <div className="mx-auto max-w-[1920px] px-4 pb-12 md:px-8">
      <div className="flex flex-col items-start gap-6 md:flex-row md:gap-5">
        <MobileFilterBar
          {...sidebarProps}
          open={mobileOpen}
          onOpenChange={setMobileOpen}
        />
        <FilterSidebar {...sidebarProps} />

        <div className="min-w-0 flex-1">
          <TemplateGrid
            templates={filtered}
            loading={loading}
            emptyTitle="没有找到匹配的提示词"
            emptyDescription="试试调整搜索关键词或取消部分筛选条件。"
          />
        </div>
      </div>
    </div>
  );
}
