import type { GovernanceSelection, GovernanceTemplateRow } from '../../../types/templateGovernance';

export function GovernanceTemplateTable({ items, selection, selectedId, onToggle, onTogglePage, onInspect }: {
  items: GovernanceTemplateRow[];
  selection: GovernanceSelection;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onTogglePage: () => void;
  onInspect: (id: string) => void;
}) {
  const selected = selection.mode === 'explicit'
    ? new Set(selection.templateIds)
    : new Set(items.map((item) => item.id).filter((id) => !selection.exclusions.includes(id)));
  const pageSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  return <div className="overflow-auto"><table className="w-full min-w-[980px] border-collapse text-left text-xs">
    <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500"><tr className="border-b">
      <th className="w-10 p-2"><input type="checkbox" aria-label="选择当前页" checked={pageSelected} onChange={onTogglePage}/></th>
      <th className="p-2">模板</th><th className="p-2">来源</th><th className="p-2">当前 / 建议分类</th><th className="p-2">质量 / Agent</th><th className="p-2">生命周期</th><th className="p-2">更新时间</th>
    </tr></thead>
    <tbody>{items.map((item) => <tr key={item.id} onClick={() => onInspect(item.id)} className={`cursor-pointer border-b border-slate-100 hover:bg-violet-50/40 ${selectedId === item.id ? 'bg-violet-50' : ''}`}>
      <td className="p-2" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} aria-label={`选择 ${item.name}`} /></td>
      <td className="p-2"><div className="flex items-center gap-2">{item.coverUrl ? <img src={item.coverUrl} className="h-10 w-10 rounded object-cover" alt="" /> : <div className="h-10 w-10 rounded bg-slate-200"/>}<div><p className="max-w-56 truncate font-medium text-slate-900">{item.name}</p><p className="max-w-56 truncate text-slate-500">{item.summary || '暂无摘要'}</p></div></div></td>
      <td className="p-2 text-slate-600">{item.source}</td><td className="p-2"><span>{item.taxonomyReviewStatus}</span><span className="mx-1 text-slate-300">/</span><span className="text-violet-700">查看建议</span></td><td className="p-2"><span>{item.coverUrl ? '完整' : '需封面'}</span><span className="mx-1 text-slate-300">/</span><span>待检查</span></td><td className="p-2">{item.status}{item.isFeatured ? ' · 精选' : ''}</td><td className="p-2 text-slate-500">{new Date(item.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
    </tr>)}</tbody>
  </table></div>;
}
