import { useCallback, useEffect, useState } from 'react';
import type { AutopublishRecoveryAction } from '@promptix/shared';
import { AutopublishExceptionList } from '../../components/admin/autopublish/AutopublishExceptionList';
import { AutopublishOverview } from '../../components/admin/autopublish/AutopublishOverview';
import { performAutopublishAction } from '../../data/autopublishApi';
import { api } from '../../lib/api';
import type { AutopublishRunView } from '../../types/autopublish';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useToast } from '../../context/ToastContext';

type Mode = 'shadow' | 'live';
type AutopublishOverviewView = {
  mode?: Mode;
  frozen?: boolean;
  delegatedEnabled?: boolean;
  scheduledAgentEnabled?: boolean;
};

export function AutopublishPage({
  canManage,
  canFreeze,
}: {
  canManage: boolean;
  canFreeze: boolean;
}) {
  const [runs, setRuns] = useState<AutopublishRunView[]>([]);
  const [exceptions, setExceptions] = useState<AutopublishRunView[]>([]);
  const [observations, setObservations] = useState<Array<Record<string, unknown>>>([]);
  const [mode, setMode] = useState<Mode>('shadow');
  const [frozen, setFrozen] = useState(false);
  const [delegatedEnabled, setDelegatedEnabled] = useState(false);
  const [changingDelegated, setChangingDelegated] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirmDialog();
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [runRows, exceptionRows, observationRows, overview] = await Promise.all([
        api<AutopublishRunView[]>('/api/admin/autopublish/runs'),
        api<AutopublishRunView[]>('/api/admin/autopublish/exceptions'),
        api<Array<Record<string, unknown>>>('/api/admin/autopublish/observations'),
        api<AutopublishOverviewView>('/api/admin/autopublish/overview'),
      ]);
      setRuns(runRows);
      setExceptions(exceptionRows);
      setObservations(observationRows);
      if (overview.mode === 'shadow' || overview.mode === 'live') setMode(overview.mode);
      if (typeof overview.frozen === 'boolean') setFrozen(overview.frozen);
      if (typeof overview.delegatedEnabled === 'boolean') {
        setDelegatedEnabled(overview.delegatedEnabled);
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '自动发布数据加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function changeMode(nextMode: Mode) {
    if (nextMode === mode) return;
    const ok = await confirm({
      title: `切换到 ${nextMode} 模式？`,
      description: nextMode === 'live' ? 'live 模式可能执行真实发布，请确认已满足上线门槛。' : 'shadow 模式只演练链路，不执行真实发布。',
      confirmLabel: '确认切换',
      danger: nextMode === 'live',
    });
    if (!ok) return;
    await api('/api/admin/autopublish/mode', { method: 'POST', body: JSON.stringify({ mode: nextMode, reason: 'operations console' }) });
    setMode(nextMode);
    toast(`已切换为 ${nextMode} 模式`, 'success');
    await load();
  }

  async function toggleFreeze() {
    const next = !frozen;
    const ok = await confirm({
      title: next ? '确认总冻结自动发布？' : '确认解除总冻结？',
      description: next ? '新任务将被拒绝，已经发布的模板不会受到影响。' : '解除后，新任务可按当前模式进入链路。',
      confirmLabel: next ? '总冻结' : '解除冻结',
      danger: next,
    });
    if (!ok) return;
    await api('/api/admin/autopublish/freeze', { method: 'POST', body: JSON.stringify({ frozen: next, reason: 'operations console' }) });
    setFrozen(next);
    toast(next ? '自动发布已总冻结' : '自动发布已解除冻结', 'success');
    await load();
  }

  async function toggleDelegated() {
    if (!canManage || changingDelegated) return;
    const next = !delegatedEnabled;
    const ok = await confirm({
      title: next ? '启用用户委托一键发布？' : '关闭用户委托一键发布？',
      description: next
        ? `智能入库将允许创建一键自动发布任务。当前为 ${mode} 模式。`
        : '关闭后，智能入库的一键自动发布请求会被拒绝；已有任务不会被删除。',
      confirmLabel: next ? '确认启用' : '确认关闭',
      danger: false,
    });
    if (!ok) return;
    setChangingDelegated(true);
    setError('');
    try {
      await api('/api/admin/autopublish/delegated', {
        method: 'POST',
        body: JSON.stringify({
          enabled: next,
          reason: 'operations console',
        }),
      });
      await load();
      toast(next ? '用户委托一键发布已启用' : '用户委托一键发布已关闭', 'success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '用户委托开关更新失败');
    } finally {
      setChangingDelegated(false);
    }
  }

  async function recover(run: AutopublishRunView, action: AutopublishRecoveryAction) {
    await performAutopublishAction(run.id, action, { idempotencyKey: crypto.randomUUID() });
    toast('恢复操作已提交', 'success');
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-600">Operations</p><h1 className="mt-1 text-2xl font-semibold">自动发布控制台</h1></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={mode === 'shadow'} className={`rounded-lg border px-3 py-2 text-sm ${mode === 'shadow' ? 'bg-slate-900 text-white' : 'bg-white'}`} onClick={() => changeMode('shadow')}>shadow</button>
          <button type="button" aria-pressed={mode === 'live'} className={`rounded-lg border px-3 py-2 text-sm ${mode === 'live' ? 'bg-emerald-700 text-white' : 'bg-white'}`} onClick={() => changeMode('live')}>live</button>
          {canFreeze && <button type="button" className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white" onClick={toggleFreeze}>{frozen ? '解除总冻结' : '总冻结'}</button>}
        </div>
      </header>
      <section className="rounded-xl border border-violet-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">启用用户委托一键发布</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${delegatedEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {delegatedEnabled ? '已启用' : '已关闭'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              控制智能入库中的“一键自动发布”。shadow 模式只演练完整链路，不执行真实发布；live 模式会执行真实发布。
            </p>
            <p className="mt-2 text-xs text-slate-500">
              当前组合：用户委托{delegatedEnabled ? '已启用' : '已关闭'} · {mode} 模式
              {frozen ? ' · 系统已总冻结' : ''}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={delegatedEnabled}
            disabled={!canManage || changingDelegated}
            onClick={toggleDelegated}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${delegatedEnabled ? 'bg-violet-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${delegatedEnabled ? 'left-6' : 'left-1'}`} />
            <span className="sr-only">{delegatedEnabled ? '关闭用户委托一键发布' : '启用用户委托一键发布'}</span>
          </button>
        </div>
      </section>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <AutopublishOverview runs={runs} observations={observations}/>
      <AutopublishExceptionList runs={exceptions} onAction={recover}/>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">模型、Prompt、Agent 与来源明细</h2>
        <p className="mt-2 text-sm text-slate-500">每个运行保留模型、Prompt 版本、Agent、来源和规则快照，可通过运行 ID 审计。</p>
      </section>
    </div>
  );
}
