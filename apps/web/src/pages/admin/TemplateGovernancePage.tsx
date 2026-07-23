import { Activity, Plus, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GovernanceBulkBar } from '../../components/admin/governance/GovernanceBulkBar';
import { GovernanceCommandBar } from '../../components/admin/governance/GovernanceCommandBar';
import { GovernanceInspector } from '../../components/admin/governance/GovernanceInspector';
import { GovernancePagination } from '../../components/admin/governance/GovernancePagination';
import { GovernanceQueueSidebar } from '../../components/admin/governance/GovernanceQueueSidebar';
import { GovernanceRulePanel } from '../../components/admin/governance/GovernanceRulePanel';
import { GovernanceRunCenter } from '../../components/admin/governance/GovernanceRunCenter';
import { GovernanceRunStatusBar } from '../../components/admin/governance/GovernanceRunStatusBar';
import { GovernanceStatePanel } from '../../components/admin/governance/GovernanceStatePanel';
import { GovernanceTemplateTable } from '../../components/admin/governance/GovernanceTemplateTable';
import { GovernanceToolbar } from '../../components/admin/governance/GovernanceToolbar';
import { confirmTemplateTaxonomy, createGovernanceRun, fetchGovernanceRun, fetchGovernanceRunStats, previewTemplateDeletion, requestTemplateDeletion, requestTemplatePublish } from '../../data/templateGovernanceApi';
import { useGovernanceRuns } from '../../hooks/useGovernanceRuns';
import { useTemplateGovernance } from '../../hooks/useTemplateGovernance';
import { useToast } from '../../context/ToastContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';

export function TemplateGovernancePage({ canManage = false }: { canManage?: boolean }) {
  const [showRules, setShowRules] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const controller = useTemplateGovernance();
  const runs = useGovernanceRuns(controller.refresh);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchGovernanceRunStats>> | null>(null);
  useEffect(() => { const abort = new AbortController(); fetchGovernanceRunStats(abort.signal).then(setStats).catch(() => undefined); return () => abort.abort(); }, [runs.runs.length]);
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const items = controller.page?.items ?? [];
  const total = controller.page?.total ?? 0;
  const selectionLabel = controller.selection.mode === 'query'
    ? `全部 ${total} 条当前筛选结果`
    : controller.selection.templateIds.length ? `${controller.selection.templateIds.length} 个明确选择的模板` : `当前筛选结果，共约 ${total} 个模板`;

  const submit = async (goal: string) => {
    const created = await createGovernanceRun({
      goal,
      scope: controller.selection.mode === 'query'
        ? controller.selection
        : controller.selection.templateIds.length
          ? controller.selection
          : { mode: 'query', query: controller.state.query, exclusions: [], snapshotAt: new Date().toISOString() },
      idempotencyKey: crypto.randomUUID(),
    });
    const run = await fetchGovernanceRun(created.id);
    runs.trackRun(run); setShowRuns(true);
    toast(`治理运行 ${created.id.slice(0, 8)} 已创建`, 'success');
    return run;
  };

  const requestDeletion = async (templateIds: string[]) => {
    if (!templateIds.length || deletionBusy) return;
    setDeletionBusy(true);
    try {
      const preview = await previewTemplateDeletion(templateIds);
      const visibleNames = preview.templates.slice(0, 8).map((template) => `- ${template.name}`).join('\n');
      const remaining = preview.total > 8 ? `\n另有 ${preview.total - 8} 个模板` : '';
      const approved = await confirm({
        title: preview.total === 1 ? '申请删除这个模板？' : `申请删除 ${preview.total} 个模板？`,
        description: `系统将创建一个独立的删除审批批次，批准后模板会从产品和管理列表中移除，版本与审计记录继续保留。\n\n${visibleNames}${remaining}`,
        confirmLabel: '提交删除审批',
        danger: true,
      });
      if (!approved) return;
      const result = await requestTemplateDeletion(templateIds);
      controller.setSelection({ mode: 'explicit', templateIds: [], proposalIds: [] });
      controller.refresh();
      void runs.refresh();
      toast(`删除审批 ${result.changeSetId.slice(0, 8)} 已创建`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除申请提交失败', 'error');
    } finally {
      setDeletionBusy(false);
    }
  };

  const confirmTaxonomy = async (templateId: string, expectedVersion: number) => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await confirmTemplateTaxonomy(templateId, expectedVersion);
      controller.refresh();
      toast('模板分类已人工确认，现在可以申请发布', 'success');
    } catch (error) {
      controller.refresh();
      toast(error instanceof Error ? error.message : '确认分类失败', 'error');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const requestPublish = async (templateId: string, expectedVersion: number) => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      const result = await requestTemplatePublish(templateId, expectedVersion);
      controller.refresh();
      void runs.refresh();
      toast(`发布审批 ${result.changeSetId.slice(0, 8)} 已创建`, 'success');
    } catch (error) {
      controller.refresh();
      toast(error instanceof Error ? error.message : '发布申请提交失败', 'error');
    } finally {
      setLifecycleBusy(false);
    }
  };

  return <div className="relative flex min-h-[720px] flex-1 flex-col overflow-hidden bg-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
      <div><h1 className="text-lg font-semibold text-slate-900">智能分拣台</h1><p className="text-xs text-slate-500">分类、质量、精选与生命周期治理</p></div>
      <div className="flex gap-2">
        <button onClick={() => { setShowRuns(true); if (!runs.selectedId && runs.runs[0]) runs.selectRun(runs.runs[0].id); }} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><Activity size={15}/>运行记录</button>
        <button onClick={() => setShowRules(true)} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><Settings2 size={15}/>治理规则</button>
        <Link to="/admin/templates/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-violet-600 px-3 text-sm font-medium text-white"><Plus size={15}/>新建模板</Link>
      </div>
    </header>
    <GovernanceCommandBar count={total} selectionLabel={selectionLabel} focusRequest={focusRequest} onSubmit={submit}/>
    <GovernanceRunStatusBar run={runs.activeRun ?? runs.runs[0] ?? null} onOpen={() => { setShowRuns(true); const target = runs.activeRun ?? runs.runs[0]; if (target) runs.selectRun(target.id); }}/>
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)_320px]">
      <GovernanceQueueSidebar queues={controller.queues} active={controller.state.query.queue} onChange={(queue) => controller.updateQuery({ queue })}/>
      <main className="relative flex min-w-0 flex-col bg-white">
        <GovernanceToolbar query={controller.state.query} total={total} onChange={controller.updateQuery}/>
        <div className="min-h-0 flex-1 overflow-auto">{controller.status === 'ready'
          ? <GovernanceTemplateTable items={items} selection={controller.selection} selectedId={controller.state.selectedId} onToggle={controller.toggleSelection} onTogglePage={controller.togglePage} onInspect={controller.select}/>
          : <GovernanceStatePanel status={controller.status} error={controller.error} onRetry={controller.refresh}/>}</div>
        <GovernancePagination hasCursor={Boolean(controller.state.cursor)} hasMore={Boolean(controller.page?.nextCursor)} onFirst={controller.firstPage} onNext={controller.nextPage}/>
        <GovernanceBulkBar selection={controller.selection} pageCount={items.length} total={total} canManage={canManage} busy={deletionBusy} onSelectAll={controller.selectAll} onGenerate={() => setFocusRequest((value) => value + 1)} onDelete={() => { if (controller.selection.mode === 'explicit') void requestDeletion(controller.selection.templateIds); }} onClear={() => controller.setSelection({ mode: 'explicit', templateIds: [], proposalIds: [] })}/>
      </main>
      <GovernanceInspector
        detail={controller.detail}
        canManage={canManage}
        deletionBusy={deletionBusy}
        lifecycleBusy={lifecycleBusy}
        onConfirmTaxonomy={(id, expectedVersion) => void confirmTaxonomy(id, expectedVersion)}
        onRequestPublish={(id, expectedVersion) => void requestPublish(id, expectedVersion)}
        onRequestDelete={(id) => void requestDeletion([id])}
      />
    </div>
    {showRules && <GovernanceRulePanel canManage={canManage} onClose={() => setShowRules(false)}/>}
    <GovernanceRunCenter open={showRuns} runs={runs.runs} stats={stats} detail={runs.detail} selectedId={runs.selectedId} loading={runs.loading} error={runs.error} onSelect={runs.selectRun} onRefresh={() => void runs.refresh()} onClose={() => setShowRuns(false)}/>
  </div>;
}
