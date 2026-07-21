import { useState } from 'react';
import { approveGovernanceChangeSet, rejectGovernanceChangeSet, retryGovernanceChangeSet, rollbackGovernanceChangeSet } from '../../../data/templateGovernanceApi';

export type ApprovalModel = { changeSet?: { id: string; status: string; ruleSetVersion: number; rollbackUntil?: string | null; summary?: Record<string, number> } | null } | null;

export function GovernanceApprovalPanel({ approval, action, canManage }: { approval: ApprovalModel; action?: string; canManage: boolean }) {
  const set = approval?.changeSet;
  const [note, setNote] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  if (!set) return null;
  const isDelete = action === 'delete';
  const expired = Boolean(set.rollbackUntil && new Date(set.rollbackUntil) < new Date());
  const run = async (task: () => Promise<unknown>, text: string) => { try { await task(); setMessage(text); } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); } };

  return <section className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">审批与执行</h3><p className="mt-1 text-xs text-slate-500">规则版本 v{set.ruleSetVersion} · 变更集 {set.id.slice(0, 8)}</p>
    {!canManage && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">只读权限：审批、重试和回滚需要 owner 账号。</p>}
    {set.summary && <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px]">{[['自动','automatic'],['审批','approval'],['冲突','conflict'],['跳过','skipped'],['失败','failed']].map(([label,key]) => <div key={key} className="rounded bg-slate-50 p-1"><b className="block">{set.summary?.[key] ?? 0}</b>{label}</div>)}</div>}
    {['conflict','failed'].includes(set.status) && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">模板或规则版本已变化，请重新生成计划。</p>}
    {canManage && set.status === 'awaiting_approval' && <div className="mt-3 space-y-2"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={isDelete ? '永久删除原因（必填）' : '审批备注'} className="w-full rounded border p-2 text-xs"/>{isDelete && <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="输入“永久删除”" className="w-full rounded border p-2 text-xs"/>}<div className="flex gap-2"><button disabled={isDelete && (confirmation !== '永久删除' || !note.trim())} onClick={() => run(() => approveGovernanceChangeSet(set.id, { idempotencyKey: crypto.randomUUID(), note, deleteConfirmation: confirmation }), '已批准')} className="rounded bg-violet-600 px-3 py-2 text-xs text-white disabled:opacity-40">批准</button><button onClick={() => run(() => rejectGovernanceChangeSet(set.id, { idempotencyKey: crypto.randomUUID(), note }), '已拒绝')} className="rounded border px-3 py-2 text-xs">拒绝</button></div></div>}
    {canManage && set.status === 'partially_succeeded' && <button onClick={() => run(() => retryGovernanceChangeSet(set.id, { idempotencyKey: crypto.randomUUID() }), '已提交失败项重试')} className="mt-3 rounded border px-3 py-2 text-xs">重试失败项</button>}
    {canManage && !isDelete && ['succeeded','partially_succeeded','rollback_available'].includes(set.status) && <button disabled={expired} onClick={() => run(() => rollbackGovernanceChangeSet(set.id, { idempotencyKey: crypto.randomUUID() }), '已提交回滚')} className="mt-3 rounded border px-3 py-2 text-xs disabled:opacity-40">{expired ? '回滚期限已过' : '回滚变更'}</button>}{message && <p className="mt-2 text-xs">{message}</p>}</section>;
}
