import { AlertCircle, Bot, CheckCircle2, Clock3, RefreshCw, X } from 'lucide-react';
import type { GovernanceRunDetail, GovernanceRunSummary } from '../../../types/templateGovernance';

const RUN_LABELS: Record<string, string> = { queued: '排队中', analyzing: '分析中', planned: '计划已生成', auto_executing: '自动执行中', awaiting_approval: '等待审批', partially_succeeded: '部分成功', succeeded: '已完成', failed: '失败', cancelled: '已取消' };
const active = new Set(['queued', 'analyzing', 'planned', 'auto_executing']);

function StatusIcon({ status }: { status: string }) {
  if (status === 'failed') return <AlertCircle size={15} className="text-red-600"/>;
  if (active.has(status)) return <Clock3 size={15} className="text-violet-600"/>;
  return <CheckCircle2 size={15} className="text-emerald-600"/>;
}

export function GovernanceRunCenter({ open, runs, detail, selectedId, loading, error, onSelect, onRefresh, onClose }: {
  open: boolean;
  runs: GovernanceRunSummary[];
  detail: GovernanceRunDetail | null;
  selectedId: string | null;
  loading: boolean;
  error: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-slate-950/30" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="ml-auto flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" aria-label="治理运行中心">
      <header className="flex h-14 items-center justify-between border-b px-5"><div className="flex items-center gap-2"><Bot size={18} className="text-violet-600"/><h2 className="font-semibold">治理运行中心</h2><span className="text-xs text-slate-500">最近 {runs.length} 次</span></div><div className="flex gap-1"><button title="刷新" onClick={onRefresh} className="grid h-9 w-9 place-items-center text-slate-500"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/></button><button title="关闭" onClick={onClose} className="grid h-9 w-9 place-items-center text-slate-500"><X size={18}/></button></div></header>
      {error && <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</p>}
      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="overflow-auto border-r bg-slate-50/70">
          {runs.map((run) => <button key={run.id} onClick={() => onSelect(run.id)} className={`block w-full border-b px-4 py-3 text-left ${selectedId === run.id ? 'bg-violet-50' : 'hover:bg-white'}`}>
            <div className="flex items-center gap-2 text-xs"><StatusIcon status={run.status}/><b>{RUN_LABELS[run.status] ?? run.status}</b><span className="ml-auto text-slate-400">{new Date(run.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
            <p className="mt-2 line-clamp-2 text-sm text-slate-700">{run.goal}</p><p className="mt-1 truncate text-[11px] text-slate-400">{run.trigger === 'scheduled' ? '定时巡检' : '人工指令'} · {run.model?.name ?? '准备模型中'}</p>
          </button>)}
          {!runs.length && <p className="p-6 text-center text-sm text-slate-500">暂无治理运行</p>}
        </aside>
        <main className="overflow-auto p-5">{detail ? <RunDetail detail={detail}/> : <div className="grid h-full place-items-center text-sm text-slate-500">选择一条运行查看模型、输入摘要和执行结果</div>}</main>
      </div>
    </section>
  </div>;
}

function RunDetail({ detail }: { detail: GovernanceRunDetail }) {
  return <div className="space-y-6">
    <section><div className="flex flex-wrap items-center gap-2"><StatusIcon status={detail.status}/><h3 className="font-semibold">{RUN_LABELS[detail.status] ?? detail.status}</h3><span className="rounded bg-slate-100 px-2 py-1 text-xs">{detail.id.slice(0, 8)}</span></div><p className="mt-3 text-sm leading-6 text-slate-700">{detail.goal}</p>{detail.errorMessage && <div className="mt-3 border-l-2 border-red-500 bg-red-50 p-3 text-sm text-red-800"><b>{detail.errorCode ?? '运行失败'}</b><p className="mt-1 whitespace-pre-wrap text-xs">{detail.errorMessage}</p></div>}</section>
    <section className="border-t pt-4"><h4 className="text-sm font-semibold">模型与请求摘要</h4><dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2"><Info label="模型" value={detail.model ? `${detail.model.name} · ${detail.model.modelId}` : '尚未选择'}/><Info label="系统 Prompt" value={detail.requestPreview.promptVersion}/><Info label="治理规则" value={`v${detail.requestPreview.ruleSetVersion}`}/><Info label="模板数量" value={String(detail.requestPreview.templateCount)}/></dl><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-violet-700">查看脱敏模型输入</summary><pre className="mt-2 max-h-56 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(detail.requestPreview, null, 2)}</pre></details></section>
    <section className="border-t pt-4"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">变更建议</h4><span className="text-xs text-slate-500">{detail.proposals.length} 项</span></div><div className="mt-3 divide-y border-y">{detail.proposals.map((proposal) => <details key={proposal.id} className="py-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm"><b className="min-w-0 flex-1 truncate">{String(proposal.currentSnapshot.name ?? proposal.templateId)}</b><span className="text-xs text-slate-500">{proposal.action}</span><span className={proposal.requiresApproval ? 'text-xs text-amber-700' : 'text-xs text-emerald-700'}>{proposal.requiresApproval ? '需审批' : '可自动'}</span></summary><p className="mt-2 text-xs leading-5 text-slate-600">{proposal.explanation}</p><pre className="mt-2 max-h-52 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(proposal.proposedPatch, null, 2)}</pre></details>)}{!detail.proposals.length && <p className="py-5 text-center text-sm text-slate-500">尚未生成建议</p>}</div></section>
    <section className="border-t pt-4"><h4 className="text-sm font-semibold">执行批次</h4>{detail.changeSets.map((set) => <div key={set.id} className="mt-3 flex items-center justify-between border-b pb-3 text-xs"><span>{set.id.slice(0, 8)} · {set.status}</span><span className="text-slate-500">{Object.entries(set.summary ?? {}).map(([key, value]) => `${key} ${value}`).join(' · ')}</span></div>)}{!detail.changeSets.length && <p className="mt-3 text-xs text-slate-500">尚未创建变更集</p>}</section>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all text-slate-700">{value}</dd></div>; }
