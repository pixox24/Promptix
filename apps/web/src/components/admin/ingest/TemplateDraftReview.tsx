import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  templateDraftSchema,
  type SemanticClassification,
  type TaxonomyDimension,
  type TemplateDraft,
  type TemplateQualityIssue,
} from '@promptix/shared';
import { api } from '../../../lib/api';
import { fetchTaxonomy, type TaxonomyTerm } from '../../../data/taxonomyApi';

const splitValues = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const dimensionLabels: Record<TaxonomyDimension, string> = {
  output_type: '产物类型', scenario: '使用场景', style: '视觉风格', subject: '画面主体',
};

function MultiSelect({ label, terms, selected, onChange }: {
  label: string;
  terms: TaxonomyTerm[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">{label} <span className="text-xs font-normal text-slate-400">可多选</span></legend>
    <div className="flex flex-wrap gap-2">
      {terms.map((term) => {
        const active = selected.includes(term.slug);
        return <button key={term.id} type="button" aria-pressed={active}
          onClick={() => onChange(active ? selected.filter((slug) => slug !== term.slug) : [...selected, term.slug])}
          className={`rounded-full border px-3 py-1.5 text-xs ${active ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>
          {term.label}
        </button>;
      })}
    </div>
  </fieldset>;
}

export function TemplateDraftReview({ draft, jobId, source, qualityIssues = [], onSaved }: {
  draft: TemplateDraft;
  jobId: string;
  source: 'text_expand' | 'image_reverse';
  qualityIssues?: TemplateQualityIssue[];
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<TemplateDraft>(() => templateDraftSchema.parse(draft));
  const [terms, setTerms] = useState<TaxonomyTerm[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const reloadTerms = () => fetchTaxonomy().then(setTerms).catch((reason) => setError(reason instanceof Error ? reason.message : '分类词库加载失败'));
  useEffect(() => { void reloadTerms(); }, []);
  const byDimension = useMemo(() => Object.fromEntries(
    (['output_type', 'scenario', 'style', 'subject'] as const).map((dimension) => [dimension, terms.filter((term) => term.dimension === dimension)]),
  ) as Record<TaxonomyDimension, TaxonomyTerm[]>, [terms]);

  const set = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setSemantic = (patch: Partial<SemanticClassification>) => setForm((current) => ({
    ...current, semantic: { ...current.semantic, ...patch },
  }));
  const setVariable = (index: number, patch: Record<string, unknown>) =>
    set('variables', form.variables.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  function resolveUnmapped(index: number, slug?: string, asTag = false) {
    const term = form.semantic.unmappedTerms[index];
    const remaining = form.semantic.unmappedTerms.filter((_, itemIndex) => itemIndex !== index);
    if (asTag) {
      setSemantic({ tags: [...new Set([...form.semantic.tags, term.label])], unmappedTerms: remaining });
      return;
    }
    if (!slug) { setSemantic({ unmappedTerms: remaining }); return; }
    if (term.dimension === 'output_type') setSemantic({ outputType: slug, unmappedTerms: remaining });
    else if (term.dimension === 'scenario') setSemantic({ scenarios: [...new Set([...form.semantic.scenarios, slug])], unmappedTerms: remaining });
    else if (term.dimension === 'style') setSemantic({ styles: [...new Set([...form.semantic.styles, slug])], unmappedTerms: remaining });
    else setSemantic({ subjects: [...new Set([...form.semantic.subjects, slug])], unmappedTerms: remaining });
  }

  async function save() {
    const parsed = templateDraftSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '请完善模板字段'); return; }
    if (confirmed && (!form.semantic.outputType || !form.semantic.scenarios.length || !form.semantic.styles.length || !form.semantic.subjects.length || form.semantic.unmappedTerms.length)) {
      setError('确认分类前，请选择产物类型、使用场景、风格和画面主体，并处理全部待处理词');
      return;
    }
    try {
      const template = await api<{ id: string; coverJob?: unknown }>('/api/admin/templates', {
        method: 'POST',
        body: JSON.stringify({ ...parsed.data, taxonomyConfirmed: confirmed, source, sourceMeta: { jobId }, autoCover: source === 'image_reverse', coverMode: source === 'image_reverse' ? 'auto_if_missing' : 'disabled' }),
      });
      onSaved?.();
      navigate(`/admin/templates/${template.id}`, { state: { coverJob: template.coverJob } });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  }

  return <div className="space-y-5 rounded-lg border bg-white p-4">
    <div><h3 className="font-semibold">模板草稿校对</h3><p className="mt-1 text-xs text-slate-500">AI 只提供建议；保存后仍是草稿，需人工确认并手动发布。</p></div>
    {qualityIssues.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3" role="status"><p className="text-sm font-medium text-amber-900">变量质量检查</p><ul className="mt-2 space-y-1 text-xs text-amber-800">{qualityIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}{issue.variableKeys.length ? `（${issue.variableKeys.join('、')}）` : ''}</li>)}</ul></div>}

    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">名称<input className="mt-1 w-full rounded border p-2" value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
      <label className="text-sm">摘要<input className="mt-1 w-full rounded border p-2" value={form.summary} onChange={(event) => set('summary', event.target.value)} /></label>
      <label className="text-sm md:col-span-2">描述<textarea className="mt-1 min-h-24 w-full rounded border p-2" value={form.description} onChange={(event) => set('description', event.target.value)} /></label>
    </div>

    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium">工作模式<select className="mt-1 w-full rounded border bg-white p-2" value={form.semantic.workflowType} onChange={(event) => setSemantic({ workflowType: event.target.value as 'generate' | 'edit' })}><option value="generate">生成图片</option><option value="edit">编辑图片</option></select></label>
        <label className="text-sm font-medium">产物类型<select className="mt-1 w-full rounded border bg-white p-2" value={form.semantic.outputType ?? ''} onChange={(event) => setSemantic({ outputType: event.target.value || null })}><option value="">待选择</option>{byDimension.output_type.map((term) => <option key={term.id} value={term.slug}>{term.label}</option>)}</select></label>
      </div>
      <MultiSelect label="使用场景" terms={byDimension.scenario} selected={form.semantic.scenarios} onChange={(scenarios) => setSemantic({ scenarios })} />
      <MultiSelect label="视觉风格" terms={byDimension.style} selected={form.semantic.styles} onChange={(styles) => setSemantic({ styles })} />
      <MultiSelect label="画面主体" terms={byDimension.subject} selected={form.semantic.subjects} onChange={(subjects) => setSemantic({ subjects })} />
      <label className="block text-sm font-medium">自由标签（逗号分隔）<input className="mt-1 w-full rounded border bg-white p-2 font-normal" value={form.semantic.tags.join(', ')} onChange={(event) => setSemantic({ tags: splitValues(event.target.value) })} /></label>
    </section>

    {form.semantic.unmappedTerms.length > 0 && <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium text-amber-900">待处理词</h4><div className="flex gap-3 text-xs"><Link className="text-violet-700 underline" to="/admin/taxonomy" target="_blank">在分类词库新建标准词</Link><button type="button" className="text-violet-700 underline" onClick={() => void reloadTerms()}>刷新选项</button></div></div>{form.semantic.unmappedTerms.map((item, index) => <div key={`${item.dimension}-${item.label}-${index}`} className="grid gap-2 rounded border border-amber-200 bg-white p-3 md:grid-cols-[1fr_1fr_auto_auto]"><div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-slate-500">{dimensionLabels[item.dimension]} · {item.reason}</p></div><select className="rounded border p-2 text-sm" defaultValue="" onChange={(event) => event.target.value && resolveUnmapped(index, event.target.value)}><option value="">映射到已有项…</option>{byDimension[item.dimension].map((term) => <option key={term.id} value={term.slug}>{term.label}</option>)}</select><button type="button" className="text-xs text-violet-700" onClick={() => resolveUnmapped(index, undefined, true)}>转自由标签</button><button type="button" className="text-xs text-slate-500" onClick={() => resolveUnmapped(index)}>忽略</button></div>)}</section>}

    <h4 className="font-medium">变量</h4>
    {form.variables.map((variable, index) => <fieldset key={variable.id ?? index} className="grid gap-2 border-t py-3 md:grid-cols-3"><legend className="sr-only">变量 {index + 1}</legend>{(['key', 'label', 'type', 'placeholder', 'defaultValue'] as const).map((key) => <input key={key} className="rounded border p-2 text-sm" placeholder={key} value={variable[key] ?? ''} onChange={(event) => setVariable(index, { [key]: event.target.value })} />)}<label className="text-xs text-slate-600 md:col-span-3">严格选项（select / ratio，逗号分隔）<textarea className="mt-1 w-full rounded border p-2 text-sm" value={(variable.options ?? []).join(', ')} onChange={(event) => setVariable(index, { options: splitValues(event.target.value) })} /></label><label className="text-xs text-slate-600 md:col-span-3">推荐值（text / number，逗号分隔）<textarea className="mt-1 w-full rounded border p-2 text-sm" value={(variable.suggestions ?? []).join(', ')} onChange={(event) => setVariable(index, { suggestions: splitValues(event.target.value) })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(variable.required)} onChange={(event) => setVariable(index, { required: event.target.checked })} />必填</label></fieldset>)}
    <label className="block text-sm">Prompt 骨架<textarea className="mt-1 min-h-32 w-full rounded border p-2 font-mono text-xs" value={form.promptTemplate} onChange={(event) => set('promptTemplate', event.target.value)} /></label>
    <label className="block text-sm">负面 Prompt<textarea className="mt-1 min-h-20 w-full rounded border p-2" value={form.negativePrompt ?? ''} onChange={(event) => set('negativePrompt', event.target.value)} /></label>
    <label className="flex items-start gap-2 rounded border border-violet-200 bg-violet-50 p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>我已检查并确认产物类型、使用场景、风格和画面主体。后续修改这些字段会重新变为待确认。</span></label>
    {error && <p className="text-sm text-red-600">{error}</p>}
    <button type="button" className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white" onClick={save}>保存为草稿</button>
  </div>;
}
