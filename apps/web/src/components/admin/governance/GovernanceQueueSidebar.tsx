import type { GovernanceQueueId } from '@promptix/shared';
import { GOVERNANCE_QUEUE_LABELS } from '../../../lib/templateGovernanceState';
import type { GovernanceQueueCount } from '../../../types/templateGovernance';

export function GovernanceQueueSidebar({ queues, active, onChange }: { queues: GovernanceQueueCount[]; active?: GovernanceQueueId; onChange: (queue: GovernanceQueueId) => void }) {
  return <aside className="border-r border-slate-200 bg-slate-50/70 p-3" aria-label="治理工作队列">
    <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">工作队列</p>
    <nav className="space-y-1">{queues.map((queue) => <button key={queue.id} onClick={() => onChange(queue.id)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${active === queue.id ? 'bg-violet-100 font-medium text-violet-800' : 'text-slate-700 hover:bg-white'}`}><span>{GOVERNANCE_QUEUE_LABELS[queue.id]}</span><span className="tabular-nums text-xs text-slate-500">{queue.count}</span></button>)}</nav>
  </aside>;
}
