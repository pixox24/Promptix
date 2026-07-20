import { useCallback, useEffect, useState } from 'react';
import type { TaxonomyDimension } from '@promptix/shared';
import { api } from '../../lib/api';
import { fetchTaxonomy, type TaxonomyTerm } from '../../data/taxonomyApi';

const dimensions: Array<{ id: TaxonomyDimension; label: string }> = [
  { id: 'output_type', label: '产物类型' }, { id: 'scenario', label: '使用场景' },
  { id: 'style', label: '视觉风格' }, { id: 'subject', label: '画面主体' },
];
const empty = (dimension: TaxonomyDimension) => ({ id: '', dimension, slug: '', label: '', description: '', aliases: '', sortOrder: 0 });

export function TaxonomyPage() {
  const [dimension, setDimension] = useState<TaxonomyDimension>('output_type');
  const [items, setItems] = useState<TaxonomyTerm[]>([]);
  const [form, setForm] = useState(empty('output_type'));
  const [error, setError] = useState('');
  const load = useCallback(() => fetchTaxonomy({ admin: true, dimension, includeDisabled: true }).then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : '加载失败')), [dimension]);
  useEffect(() => { setForm(empty(dimension)); load(); }, [dimension, load]);

  async function save() {
    setError('');
    const payload = { label: form.label, description: form.description, aliases: form.aliases.split(',').map((value) => value.trim()).filter(Boolean), sortOrder: Number(form.sortOrder) };
    try {
      if (form.id) await api(`/api/admin/taxonomy/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/api/admin/taxonomy', { method: 'POST', body: JSON.stringify({ ...payload, dimension, slug: form.slug }) });
      setForm(empty(dimension));
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  }
  async function toggle(item: TaxonomyTerm) {
    try { await api(`/api/admin/taxonomy/${item.id}/${item.enabled ? 'disable' : 'enable'}`, { method: 'POST' }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '状态更新失败'); }
  }

  const field = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500';
  return <div>
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Operations</p><h1 className="mt-1 text-2xl font-semibold">分类词库</h1><p className="mt-2 text-sm text-gray-500">AI 只能选择这里启用的正式词；slug 创建后不可修改。</p></div>
    <div className="mb-5 flex flex-wrap gap-2">{dimensions.map((item) => <button key={item.id} onClick={() => setDimension(item.id)} className={`rounded-full px-4 py-2 text-sm ${dimension === item.id ? 'bg-violet-600 text-white' : 'border bg-white text-gray-600'}`}>{item.label}</button>)}</div>
    <div className="mb-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2 lg:grid-cols-5">
      <input className={field} placeholder="slug，如 wallpaper" value={form.slug} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
      <input className={field} placeholder="中文名称" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
      <input className={field} placeholder="别名，逗号分隔" value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} />
      <input className={field} type="number" min="0" placeholder="排序" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} />
      <div className="flex gap-2"><button className="flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white" onClick={save}>{form.id ? '保存修改' : '新建'}</button>{form.id && <button className="rounded-lg border px-3 text-sm" onClick={() => setForm(empty(dimension))}>取消</button>}</div>
      <input className={`${field} md:col-span-2 lg:col-span-5`} placeholder="说明" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
    </div>
    {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="p-3">名称</th><th>slug</th><th>别名</th><th>引用</th><th>状态</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-medium">{item.label}</td><td className="font-mono text-xs">{item.slug}</td><td className="max-w-xs truncate text-xs text-gray-500">{item.aliases?.join('、') || '—'}</td><td>{item.referenceCount ?? 0}</td><td>{item.enabled ? '启用' : '停用'}</td><td className="p-3 text-right"><button className="mr-3 text-violet-600" onClick={() => setForm({ id: item.id, dimension, slug: item.slug, label: item.label, description: item.description, aliases: item.aliases?.join(', ') ?? '', sortOrder: item.sortOrder })}>编辑</button><button className={item.enabled ? 'text-amber-600' : 'text-emerald-600'} onClick={() => toggle(item)}>{item.enabled ? '停用' : '启用'}</button></td></tr>)}</tbody></table>{!items.length && <p className="p-10 text-center text-sm text-gray-400">暂无词条</p>}</div>
  </div>;
}
