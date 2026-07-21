import { GOVERNANCE_REASON_LABELS } from '../../../lib/templateGovernanceState';
import type { GovernanceTemplateDetail } from '../../../types/templateGovernance';

export function GovernanceInspector({ detail }: { detail: GovernanceTemplateDetail | null }) {
  if (!detail) return <aside className="border-l border-slate-200 bg-white p-5 text-sm text-slate-500">选择一行，在这里查看模板预览、Agent 解释和版本历史。</aside>;
  const proposal = detail.activeProposal;
  return <aside className="overflow-auto border-l border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-slate-500">当前模板</p><h2 className="mt-1 font-semibold text-slate-900">{detail.template.name}</h2></div><span className="rounded bg-slate-100 px-2 py-1 text-xs">v{detail.template.currentVersion}</span></div>
    <section className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Agent 建议</h3>{proposal ? <><div className="mt-2 flex gap-2"><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{proposal.riskLevel} 风险</span><span className="rounded bg-violet-50 px-2 py-1 text-xs text-violet-700">置信度 {Math.round(Number(proposal.confidence) * 100)}%</span></div><p className="mt-3 text-sm leading-6 text-slate-700">{proposal.explanation}</p><div className="mt-2 flex flex-wrap gap-1">{proposal.reasonCodes.map((code) => <span key={code} className="rounded border px-2 py-1 text-xs">{GOVERNANCE_REASON_LABELS[code] ?? code}</span>)}</div><pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(proposal.proposedPatch, null, 2)}</pre></> : <p className="mt-2 text-sm text-slate-500">暂无活动建议，可通过顶部指令生成计划。</p>}</section>
    <section className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">版本历史</h3><p className="mt-2 text-xs text-slate-500">已记录 {detail.history.length} 个不可变版本</p></section></aside>;
}
