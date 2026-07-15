import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FilterSidebar,
  MobileFilterBar,
} from '../components/browse/FilterSidebar';
import { TemplateGrid } from '../components/template/TemplateGrid';
import { templates } from '../data/templates';
import type { SortOption, TemplateCategory } from '../types/prompt';
import { categoryLabelMap } from '../data/categories';

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as SortOption) || 'hot';
  const category = (params.get('category') as TemplateCategory | 'all') || 'all';
  const tagsParam = params.get('tags') ?? '';
  const selectedTags = tagsParam ? tagsParam.split(',').filter(Boolean) : [];

  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 280);
    return () => window.clearTimeout(t);
  }, [query, sort, tagsParam, category]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (!value || value === 'all') next.delete(key);
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

  const filtered = useMemo(() => {
    let list = [...templates];

    if (category && category !== 'all') {
      list = list.filter((t) => t.category === category);
    }

    if (query.trim()) {
      const kw = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(kw) ||
          t.summary.toLowerCase().includes(kw) ||
          t.tags.some((x) => x.toLowerCase().includes(kw)),
      );
    }

    if (selectedTags.length) {
      list = list.filter((t) =>
        selectedTags.some((tag) => t.tags.includes(tag)),
      );
    }

    switch (sort) {
      case 'latest':
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case 'favorites':
        list.sort((a, b) => b.favoriteCount - a.favoriteCount);
        break;
      default:
        list.sort((a, b) => b.useCount - a.useCount);
    }

    return list;
  }, [query, sort, selectedTags, category]);

  const sidebarProps = {
    query,
    onQueryChange: (q: string) => update({ q: q || null }),
    sort,
    onSortChange: (s: SortOption) => update({ sort: s === 'hot' ? null : s }),
    selectedTags,
    onToggleTag,
  };

  return (
    <div className="mx-auto max-w-[1920px] px-4 pb-12 md:px-8">
      {category !== 'all' && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>分类</span>
          <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            {categoryLabelMap[category as TemplateCategory] ?? category}
          </span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => update({ category: null })}
          >
            清除
          </button>
        </div>
      )}

      <div className="flex flex-col items-start gap-6 md:flex-row md:gap-5">
        <MobileFilterBar
          {...sidebarProps}
          open={mobileOpen}
          onOpenChange={setMobileOpen}
        />
        <FilterSidebar {...sidebarProps} />
        <div className="min-w-0 flex-1">
          <TemplateGrid templates={filtered} loading={loading} />
        </div>
      </div>
    </div>
  );
}
