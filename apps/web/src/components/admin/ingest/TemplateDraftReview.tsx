import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { templateDraftSchema, type TemplateQualityIssue } from '@promptix/shared';
import { api } from '../../../lib/api';

const splitValues = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

export function TemplateDraftReview({ draft, jobId, source, qualityIssues = [], onSaved }: { draft: any; jobId: string; source: string; qualityIssues?: TemplateQualityIssue[]; onSaved?: () => void }) {
  const [form, setForm] = useState({ ...draft });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const setVariable = (index: number, patch: Record<string, unknown>) => set('variables', form.variables.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...patch } : item));

  async function save() {
    const parsed = templateDraftSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请完善模板字段');
      return;
    }
    try {
      const template = await api<{ id: string; coverJob?: unknown }>('/api/admin/templates', { method: 'POST', body: JSON.stringify({ ...parsed.data, source, sourceMeta: { jobId }, autoCover: source === 'image_reverse', coverMode: source === 'image_reverse' ? 'auto_if_missing' : 'disabled' }) });
      onSaved?.();
      navigate(`/admin/templates/${template.id}`, { state: { coverJob: template.coverJob } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败');
    }
  }

  return <div className="space-y-3 rounded-lg border bg-white p-4">
    <h3 className="font-semibold">模板校对</h3>
    {qualityIssues.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3" role="status"><p className="text-sm font-medium text-amber-900">变量质量检查</p><ul className="mt-2 space-y-1 text-xs text-amber-800">{qualityIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}{issue.variableKeys.length ? `（${issue.variableKeys.join('、')}）` : ''}</li>)}</ul></div>}
    {(['name', 'summary', 'description', 'category', 'tags', 'scenarios', 'promptTemplate', 'negativePrompt'] as const).map(key => <label key={key} className="block text-sm">{key}<textarea className="mt-1 w-full rounded border p-2" rows={key === 'description' || key === 'promptTemplate' ? 4 : 1} value={Array.isArray(form[key]) ? form[key].join(', ') : (form[key] ?? '')} onChange={event => set(key, ['tags', 'scenarios'].includes(key) ? splitValues(event.target.value) : event.target.value)} /></label>)}
    <h4 className="font-medium">变量</h4>
    {(form.variables ?? []).map((variable: any, index: number) => <fieldset key={variable.id ?? index} className="grid gap-2 border-t py-3 md:grid-cols-3">
      <legend className="sr-only">变量 {index + 1}</legend>
      {(['key', 'label', 'type', 'placeholder', 'defaultValue'] as const).map(key => <input key={key} className="rounded border p-2 text-sm" placeholder={key} value={variable[key] ?? ''} onChange={event => setVariable(index, { [key]: event.target.value })} />)}
      <label className="text-xs text-slate-600 md:col-span-3">严格选项（select / ratio，逗号分隔）<textarea className="mt-1 w-full rounded border p-2 text-sm" value={(variable.options ?? []).join(', ')} onChange={event => setVariable(index, { options: splitValues(event.target.value) })} /></label>
      <label className="text-xs text-slate-600 md:col-span-3">推荐值（text / number，逗号分隔）<textarea className="mt-1 w-full rounded border p-2 text-sm" value={(variable.suggestions ?? []).join(', ')} onChange={event => setVariable(index, { suggestions: splitValues(event.target.value) })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(variable.required)} onChange={event => setVariable(index, { required: event.target.checked })} />必填</label>
    </fieldset>)}
    {error && <p className="text-sm text-red-600">{error}</p>}
    <button type="button" className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white" onClick={save}>保存模板</button>
  </div>;
}
