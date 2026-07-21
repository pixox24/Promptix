import { Bot, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GovernanceRunSummary } from '../../../types/templateGovernance';

export function GovernanceCommandBar({
  count,
  selectionLabel,
  focusRequest,
  onSubmit,
}: {
  count: number;
  selectionLabel: string;
  focusRequest: number;
  onSubmit: (goal: string) => Promise<GovernanceRunSummary>;
}) {
  const [goal, setGoal] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusRequest) inputRef.current?.focus(); }, [focusRequest]);

  const submit = async () => {
    if (!preview) { setPreview(true); return; }
    setBusy(true); setError('');
    try {
      await onSubmit(goal.trim());
      setGoal(''); setPreview(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : '治理任务提交失败');
    } finally { setBusy(false); }
  };

  return <section className="border-b border-slate-200 bg-white px-4 py-3" aria-label="Agent 指令">
    <div className="flex items-center gap-2">
      <Bot size={18} className="shrink-0 text-violet-600" />
      <input
        ref={inputRef}
        value={goal}
        onChange={(event) => { setGoal(event.target.value); setPreview(false); setError(''); }}
        onKeyDown={(event) => { if (event.key === 'Enter' && goal.trim() && !busy) void submit(); }}
        placeholder="告诉 Agent 要整理什么，例如：检查分类并推荐精选模板"
        className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-sm outline-none"
      />
      <button className="inline-flex h-9 items-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!goal.trim() || busy} onClick={() => void submit()}>
        <Send size={15}/>{preview ? busy ? '提交中' : '确认提交' : '解释指令'}
      </button>
    </div>
    {preview && <div className="mt-2 flex items-center justify-between border-l-2 border-violet-500 bg-violet-50 px-3 py-2 text-xs text-violet-900">
      <span>范围：{selectionLabel || `当前筛选结果，共约 ${count} 个模板`}。系统先生成计划，高风险操作仍需审批。</span>
      <button onClick={() => setPreview(false)} title="修改指令" className="ml-3 text-violet-700"><X size={15}/></button>
    </div>}
    {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
  </section>;
}
