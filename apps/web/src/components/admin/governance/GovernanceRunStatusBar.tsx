import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { GovernanceRunSummary } from '../../../types/templateGovernance';

const active = new Set(['queued', 'analyzing', 'planned', 'auto_executing']);

export function GovernanceRunStatusBar({ run, onOpen }: { run: GovernanceRunSummary | null; onOpen: () => void }) {
  if (!run) return null;
  const failed = run.status === 'failed'; const running = active.has(run.status);
  return <button onClick={onOpen} className={`flex w-full items-center gap-2 border-b px-4 py-2 text-left text-xs ${failed ? 'border-red-200 bg-red-50 text-red-800' : running ? 'border-violet-200 bg-violet-50 text-violet-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
    {failed ? <AlertCircle size={15}/> : running ? <LoaderCircle size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}<b>{failed ? '治理运行失败' : running ? 'Agent 正在处理' : '治理运行已更新'}</b><span className="min-w-0 flex-1 truncate">{run.goal}</span><span>{run.errorCode ?? run.status} · 查看详情</span>
  </button>;
}
