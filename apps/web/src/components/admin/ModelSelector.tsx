import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, Star } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminModel } from '../../types/adminModels';

type Role = 'text' | 'vision' | 'image';
const roleLabel: Record<Role, string> = { text: '文本', vision: '视觉', image: '生图' };
const field = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

export function ModelSelector({ models, value, onChange, role, disabled, onModelsUpdated }: { models: AdminModel[]; value: string; onChange: (id: string) => void; role: Role; disabled?: boolean; onModelsUpdated?: (models: AdminModel[]) => void }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = models.find((model) => model.id === value);
  const defaultKey = role === 'text' ? 'isDefaultText' : role === 'vision' ? 'isDefaultVision' : 'isDefaultImage';
  useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  async function setDefault(event: React.MouseEvent, model: AdminModel) {
    event.stopPropagation();
    if (busyId || model[defaultKey]) return;
    setBusyId(model.id);
    setError('');
    try {
      await api<AdminModel>(`/api/admin/models/${model.id}`, { method: 'PATCH', body: JSON.stringify({ [defaultKey]: true }) });
      onModelsUpdated?.(await api<AdminModel[]>('/api/admin/models'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '默认模型设置失败');
    } finally { setBusyId(''); }
  }
  return <div ref={ref} className="relative"><button type="button" className={`${field} flex items-center gap-2 text-left`} disabled={disabled} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}><span className="min-w-0 flex-1 truncate">{selected ? `${selected.providerName} · ${selected.name}` : '请选择模型'}</span><ChevronDown size={16} className="shrink-0 text-gray-400" /></button>{open && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white p-1 shadow-lg" role="listbox">{models.map((model) => <div key={model.id} role="option" aria-selected={model.id === value} className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-violet-50 ${model.id === value ? 'bg-violet-50' : ''}`} onClick={() => { onChange(model.id); setOpen(false); }}><span className="min-w-0 flex-1"><span className="block truncate">{model.providerName} · {model.name}</span><span className="block truncate text-xs text-gray-400">{model.modelId}</span></span><button type="button" title={model[defaultKey] ? `当前默认${roleLabel[role]}模型` : `设为默认${roleLabel[role]}模型`} aria-label={model[defaultKey] ? `当前默认${roleLabel[role]}模型` : `设为默认${roleLabel[role]}模型`} disabled={Boolean(busyId) || model[defaultKey]} onClick={(event) => setDefault(event, model)} className={`grid h-8 w-8 shrink-0 place-items-center ${model[defaultKey] ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`}>{busyId === model.id ? <LoaderCircle size={16} className="animate-spin" /> : <Star size={17} fill={model[defaultKey] ? 'currentColor' : 'none'} />}</button></div>)}{!models.length && <p className="px-3 py-2 text-sm text-gray-500">暂无可用模型</p>}{error && <p className="border-t px-3 py-2 text-xs text-red-600" role="alert">{error}</p>}<p className="border-t px-3 py-2 text-xs text-gray-400">星标会影响所有使用默认{roleLabel[role]}模型的功能</p></div>}</div>;
}
