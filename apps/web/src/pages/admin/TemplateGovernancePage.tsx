import { Link } from 'react-router-dom';
import { GovernanceBulkBar } from '../../components/admin/governance/GovernanceBulkBar';
import { GovernanceCommandBar } from '../../components/admin/governance/GovernanceCommandBar';
import { GovernanceInspector } from '../../components/admin/governance/GovernanceInspector';
import { GovernanceQueueSidebar } from '../../components/admin/governance/GovernanceQueueSidebar';
import { GovernanceTemplateTable } from '../../components/admin/governance/GovernanceTemplateTable';
import { createGovernanceRun } from '../../data/templateGovernanceApi';
import { useTemplateGovernance } from '../../hooks/useTemplateGovernance';
import { GovernanceRulePanel } from '../../components/admin/governance/GovernanceRulePanel';
import { useState } from 'react';

export function TemplateGovernancePage() {
  const [showRules, setShowRules] = useState(false);
  const controller = useTemplateGovernance(); const items = controller.page?.items ?? [];
  return <div className="flex min-h-0 flex-1 flex-col bg-slate-100"><header className="flex items-center justify-between border-b bg-white px-5 py-3"><div><h1 className="text-lg font-semibold text-slate-900">智能分拣台</h1><p className="text-xs text-slate-500">分类、质量、精选与生命周期治理</p></div><div className="flex gap-2"><button onClick={() => setShowRules(true)} className="rounded-md border px-3 py-2 text-sm">治理规则</button><Link to="/admin/templates/new" className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white">新建模板</Link></div></header>
    <GovernanceCommandBar count={controller.page?.total ?? 0} onSubmit={async (goal) => { await createGovernanceRun({ goal, scope: controller.selection.mode === 'explicit' && controller.selection.templateIds.length ? controller.selection : { mode: 'query', query: controller.state.query, exclusions: [], snapshotAt: new Date().toISOString() }, idempotencyKey: crypto.randomUUID() }); }} />
    <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)_320px]"><GovernanceQueueSidebar queues={controller.queues} active={controller.state.query.queue} onChange={(queue) => controller.updateQuery({ queue })}/><main className="relative min-w-0 bg-white">{controller.status === 'loading' ? <div className="p-8 text-center text-sm text-slate-500">正在加载治理队列…</div> : items.length ? <GovernanceTemplateTable items={items} selection={controller.selection} selectedId={controller.state.selectedId} onToggle={controller.toggleSelection} onInspect={controller.select}/> : <div className="p-8 text-center text-sm text-slate-500">{controller.status === 'filtered-empty' ? '当前筛选条件没有匹配模板' : '当前队列没有待处理工作'}</div>}<GovernanceBulkBar selection={controller.selection} onClear={() => controller.setSelection({ mode: 'explicit', templateIds: [], proposalIds: [] })}/></main><GovernanceInspector detail={controller.detail}/></div>
    {showRules && <GovernanceRulePanel onClose={() => setShowRules(false)}/>}
  </div>;
}
