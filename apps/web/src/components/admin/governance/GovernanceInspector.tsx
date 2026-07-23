import { CheckCircle2, Edit3, Send, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GOVERNANCE_REASON_LABELS } from '../../../lib/templateGovernanceState';
import type { GovernanceTemplateDetail } from '../../../types/templateGovernance';
import { GovernanceApprovalPanel, type ApprovalModel } from './GovernanceApprovalPanel';

type GovernanceInspectorProps = {
  detail: GovernanceTemplateDetail | null;
  canManage: boolean;
  deletionBusy: boolean;
  lifecycleBusy: boolean;
  onConfirmTaxonomy: (id: string, expectedVersion: number) => void;
  onRequestPublish: (id: string, expectedVersion: number) => void;
  onRequestDelete: (id: string) => void;
};

export function GovernanceInspector({
  detail,
  canManage,
  deletionBusy,
  lifecycleBusy,
  onConfirmTaxonomy,
  onRequestPublish,
  onRequestDelete,
}: GovernanceInspectorProps) {
  if (!detail) {
    return <aside className="border-l border-slate-200 bg-white p-5 text-sm text-slate-500">选择一行，在这里查看模板预览、Agent 解释和版本历史。</aside>;
  }

  const proposal = detail.activeProposal;
  const taxonomyReviewed = detail.template.taxonomyReviewStatus === 'reviewed';
  const isDraft = detail.template.status === 'draft';
  const hasCover = Boolean(detail.template.coverUrl);
  const mutationBlocked = Boolean(proposal) || lifecycleBusy;

  return <aside className="overflow-auto border-l border-slate-200 bg-white p-4">
    <div className="flex items-start justify-between gap-2">
      <div><p className="text-xs text-slate-500">当前模板</p><h2 className="mt-1 font-semibold text-slate-900">{detail.template.name}</h2></div>
      <span className="rounded bg-slate-100 px-2 py-1 text-xs">v{detail.template.currentVersion}</span>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <Link to={`/admin/templates/${detail.template.id}`} className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-200 px-3 text-xs font-medium text-slate-700">
        <Edit3 size={14}/>编辑模板
      </Link>
      {canManage && !taxonomyReviewed && <button
        disabled={mutationBlocked}
        title={proposal ? '请先处理当前治理建议' : '确认当前模板分类'}
        onClick={() => onConfirmTaxonomy(detail.template.id, detail.template.currentVersion)}
        className="inline-flex h-8 items-center gap-1.5 rounded border border-violet-200 px-3 text-xs font-medium text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CheckCircle2 size={14}/>{lifecycleBusy ? '处理中…' : '确认分类'}
      </button>}
      {canManage && isDraft && taxonomyReviewed && <button
        disabled={mutationBlocked || !hasCover}
        title={!hasCover ? '请先编辑模板并设置封面' : proposal ? '请先处理当前治理建议' : '创建发布审批'}
        onClick={() => onRequestPublish(detail.template.id, detail.template.currentVersion)}
        className="inline-flex h-8 items-center gap-1.5 rounded bg-emerald-600 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Send size={14}/>{lifecycleBusy ? '提交中…' : '申请发布'}
      </button>}
      {canManage && <button
        disabled={deletionBusy || Boolean(proposal)}
        title={proposal ? '请先处理当前治理建议' : '创建删除审批'}
        onClick={() => onRequestDelete(detail.template.id)}
        className="inline-flex h-8 items-center gap-1.5 rounded border border-red-200 px-3 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={14}/>{deletionBusy ? '提交中…' : '申请删除'}
      </button>}
    </div>

    <div className={`mt-3 rounded-md px-3 py-2 text-xs ${taxonomyReviewed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {taxonomyReviewed
        ? isDraft ? '分类已人工确认，可以直接申请发布，无需在 Agent 输入框中输入“发布”。' : '分类已人工确认。'
        : '分类结果尚未人工确认。确认无误后点击“确认分类”，或者返回编辑模板调整分类。'}
      {!hasCover && isDraft && <span className="mt-1 block">发布前还需要设置模板封面。</span>}
    </div>

    <section className="mt-5 border-t pt-4">
      <h3 className="text-sm font-semibold">Agent 建议</h3>
      {proposal ? <>
        <div className="mt-2 flex gap-2"><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{proposal.riskLevel} 风险</span><span className="rounded bg-violet-50 px-2 py-1 text-xs text-violet-700">置信度 {Math.round(Number(proposal.confidence) * 100)}%</span></div>
        <p className="mt-3 text-sm leading-6 text-slate-700">{proposal.explanation}</p>
        <div className="mt-2 flex flex-wrap gap-1">{proposal.reasonCodes.map((code) => <span key={code} className="rounded border px-2 py-1 text-xs">{GOVERNANCE_REASON_LABELS[code] ?? code}</span>)}</div>
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(proposal.proposedPatch, null, 2)}</pre>
      </> : <p className="mt-2 text-sm text-slate-500">暂无活动建议，可通过顶部指令生成分析计划。</p>}
    </section>
    <GovernanceApprovalPanel approval={detail.approval as ApprovalModel} action={proposal?.action} canManage={canManage}/>
    <section className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">版本历史</h3><p className="mt-2 text-xs text-slate-500">已记录 {detail.history.length} 个不可变版本</p></section>
  </aside>;
}
