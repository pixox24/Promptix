import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PromptTemplate, SortOption } from '../types/prompt';
import { templates as staticTemplates } from '../data/templates';
import { fetchTemplates } from '../data/templateApi';
import { fetchTaxonomy, type TaxonomyTerm } from '../data/taxonomyApi';

const csv = (value: string | null) => value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];

export function useTemplateBrowse() {
  const [params, setParams] = useSearchParams();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [taxonomyTerms, setTaxonomyTerms] = useState<TaxonomyTerm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as SortOption | 'relevance') || (query ? 'relevance' : 'hot');
  const outputType = params.get('outputType') ?? '';
  const scenariosParam = params.get('scenarios');
  const stylesParam = params.get('styles');
  const subjectsParam = params.get('subjects');
  const scenarios = useMemo(() => csv(scenariosParam), [scenariosParam]);
  const styles = useMemo(() => csv(stylesParam), [stylesParam]);
  const subjects = useMemo(() => csv(subjectsParam), [subjectsParam]);
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const displayTemplates = useMemo(() => {
    const outputLabels = new Map(taxonomyTerms.filter((term) => term.dimension === 'output_type').map((term) => [term.slug, term.label]));
    return templates.map((template) => ({
      ...template,
      outputTypeLabel: template.semantic?.outputType ? outputLabels.get(template.semantic.outputType) : undefined,
    }));
  }, [templates, taxonomyTerms]);

  useEffect(() => { fetchTaxonomy().then(setTaxonomyTerms).catch((reason) => setError(reason instanceof Error ? reason.message : '分类词库加载失败')); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      fetchTemplates({ q: query || undefined, sort, outputType: outputType || undefined, scenarios, styles, subjects, page, pageSize: 24 }, controller.signal)
        .then((result) => { setTemplates(result.items); setTotal(result.total); })
        .catch((reason) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          if (import.meta.env.DEV && import.meta.env.VITE_USE_STATIC_TEMPLATES === '1') { setTemplates(staticTemplates); setTotal(staticTemplates.length); return; }
          setTemplates([]); setTotal(0); setError(reason instanceof Error ? reason.message : '模板加载失败');
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, sort, outputType, scenarios, styles, subjects, page]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => { if (!value) next.delete(key); else next.set(key, value); });
    if (!Object.hasOwn(patch, 'page')) next.delete('page');
    setParams(next, { replace: true });
  };
  const toggle = (key: 'scenarios' | 'styles' | 'subjects', value: string) => {
    const current = key === 'scenarios' ? scenarios : key === 'styles' ? styles : subjects;
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    update({ [key]: next.length ? next.join(',') : null });
  };
  return {
    templates: displayTemplates, taxonomyTerms, total, loading, error, query, sort, outputType, scenarios, styles, subjects, page,
    update, toggle,
  };
}
