import { useState } from 'react';

export function GovernanceCommandBar({ count, onSubmit }: { count: number; onSubmit: (goal: string) => Promise<void> }) {
  const [goal, setGoal] = useState(''); const [preview, setPreview] = useState(false); const [busy, setBusy] = useState(false);
  return <div className="border-b border-slate-200 bg-white p-3">
    <div className="flex gap-2"><input value={goal} onChange={(event) => { setGoal(event.target.value); setPreview(false); }} placeholder="告诉 Agent 要整理什么，例如：检查分类并推荐精选模板" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500" />
      <button className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!goal.trim() || busy} onClick={async () => { if (!preview) { setPreview(true); return; } setBusy(true); try { await onSubmit(goal.trim()); setGoal(''); setPreview(false); } finally { setBusy(false); } }}>{preview ? busy ? '提交中…' : '确认提交' : '解释指令'}</button></div>
    {preview && <div className="mt-2 flex items-center justify-between rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900"><span>解释范围：当前筛选结果，共约 {count} 个模板；先生成变更计划，不直接执行高风险操作。</span><button onClick={() => setPreview(false)} className="font-medium">修改</button></div>}
  </div>;
}
