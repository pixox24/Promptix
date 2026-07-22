import { Bot, CheckSquare, Trash2, X } from 'lucide-react';
import type { GovernanceSelection } from '../../../types/templateGovernance';

export function GovernanceBulkBar({ selection, pageCount, total, canManage, busy, onSelectAll, onGenerate, onDelete, onClear }: {
  selection: GovernanceSelection;
  pageCount: number;
  total: number;
  canManage: boolean;
  busy: boolean;
  onSelectAll: () => void;
  onGenerate: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const count = selection.mode === 'explicit' ? selection.templateIds.length : total;
  if (!count) return null;
  return <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
    <CheckSquare size={16}/><span className="whitespace-nowrap">已选择 {selection.mode === 'query' ? `全部 ${total}` : count} 项</span>
    {selection.mode === 'explicit' && count === pageCount && total > pageCount && <button className="whitespace-nowrap text-violet-300" onClick={onSelectAll}>选择全部 {total} 项</button>}
    <button className="inline-flex items-center gap-1.5 rounded bg-violet-500 px-3 py-1.5 font-medium" onClick={onGenerate}><Bot size={14}/>填写 Agent 指令</button>
    {canManage && <button disabled={busy || selection.mode !== 'explicit'} title={selection.mode === 'query' ? '删除前请明确勾选具体模板' : '为选中模板创建删除审批'} className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40" onClick={onDelete}><Trash2 size={14}/>{busy ? '提交中' : '申请删除'}</button>}
    <button title="清除选择" className="text-slate-300" onClick={onClear}><X size={16}/></button>
  </div>;
}
