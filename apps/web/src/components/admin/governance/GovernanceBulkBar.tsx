import type { GovernanceSelection } from '../../../types/templateGovernance';
export function GovernanceBulkBar({ selection, onClear }: { selection: GovernanceSelection; onClear: () => void }) {
  const count = selection.mode === 'explicit' ? selection.templateIds.length : '全部'; if (!count) return null;
  return <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"><span>已选择 {count} 项</span><button className="rounded bg-violet-500 px-3 py-1.5 font-medium">生成治理计划</button><button className="text-slate-300" onClick={onClear}>清除</button></div>;
}
