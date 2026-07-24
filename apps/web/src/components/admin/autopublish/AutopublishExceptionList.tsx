import type { AutopublishRecoveryAction } from '@promptix/shared';
import type { AutopublishRunView } from '../../../types/autopublish';

export const actionLabels: Record<AutopublishRecoveryAction, string> = {
  edit_draft: '编辑草稿后重新校验',
  map_taxonomy: '重新映射分类',
  review_taxonomy: '人工确认分类',
  retry_cover: '重新生成封面',
  retry_quality: '重新执行质量审核',
  confirm_distinct: '确认保留为独立模板',
  retry_after_conflict: '现有任务结束后重试',
};

export function AutopublishExceptionList({
  runs,
  onAction,
}: {
  runs: AutopublishRunView[];
  onAction: (run: AutopublishRunView, action: AutopublishRecoveryAction) => void;
}) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">异常队列</h2>
      <div className="mt-4 space-y-3">
        {runs.map((run) => {
          const actions = run.errorCode === 'SAFETY_REJECTED' ? [] : run.nextAllowedActions;
          return (
            <article key={run.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs text-slate-500">{run.id}</p>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{run.status}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                <div><dt>阶段</dt><dd>{run.currentStage}</dd></div>
                <div><dt>错误码</dt><dd>{run.errorCode ?? '—'}</dd></div>
                <div><dt>模型调用</dt><dd>{run.budgetConsumed.modelCalls}/{run.budgetSnapshot.maximumModelCalls}</dd></div>
                <div><dt>证据</dt><dd>{run.artifacts?.length ?? 0} 项</dd></div>
              </dl>
              {actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="rounded-lg border border-violet-200 px-3 py-1.5 text-xs text-violet-700"
                      onClick={() => onAction(run, action)}
                    >
                      {actionLabels[action]}
                    </button>
                  ))}
                </div>
              )}
              {run.errorCode === 'SAFETY_REJECTED' && (
                <p className="mt-3 text-xs text-red-700">安全规则拒绝，不提供普通重试或继续操作。</p>
              )}
            </article>
          );
        })}
        {!runs.length && <p className="py-8 text-center text-sm text-slate-400">当前没有待处理异常</p>}
      </div>
    </section>
  );
}
