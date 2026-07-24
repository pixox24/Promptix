import type { AutopublishRecoveryAction } from '@promptix/shared';
import type { AutopublishRunView } from '../../../types/autopublish';

const stages = [
  ['generating_draft', '生成草稿'],
  ['validating', '校验结构'],
  ['verifying_taxonomy', '确认分类'],
  ['screening', '安全检查'],
  ['checking_duplicates', '重复检查'],
  ['creating_template', '创建模板'],
  ['generating_cover', '生成封面'],
  ['reviewing_quality', '质量审核'],
  ['issuing_permit', '签发许可'],
  ['publishing', '发布'],
] as const;

const actionLabels: Record<AutopublishRecoveryAction, string> = {
  edit_draft: '编辑草稿',
  map_taxonomy: '重新映射分类',
  review_taxonomy: '人工确认分类',
  confirm_distinct: '确认保留为独立模板',
  retry_cover: '重新生成封面',
  retry_quality: '重新执行质量审核',
  retry_after_conflict: '现有任务结束后重试',
};

export function stageAnnouncement(run: AutopublishRunView) {
  const label = stages.find(([id]) => id === run.currentStage)?.[1] ?? run.currentStage;
  return `自动发布当前阶段：${label}`;
}

export function AutopublishRunCard({
  run,
  announcement,
  onAction,
}: {
  run: AutopublishRunView;
  announcement?: string;
  onAction?: (action: AutopublishRecoveryAction) => void;
}) {
  const currentIndex = stages.findIndex(([id]) => id === run.currentStage);
  const elapsedMinutes = Math.max(
    0,
    Math.round(((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.createdAt)) / 60_000),
  );

  return (
    <section className="mt-4 rounded-xl border bg-white p-4" aria-label="自动发布进度">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement || stageAnnouncement(run)}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">自动发布任务</h3>
          <p className="mt-1 text-sm text-slate-500">状态：{run.status} · 已运行 {elapsedMinutes} 分钟</p>
        </div>
        <p className="text-xs text-slate-500">可以离开此页面，任务会在后台继续。</p>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {stages.map(([id, label], index) => (
          <li
            key={id}
            className={`rounded-lg border px-3 py-2 text-sm ${
              index === currentIndex
                ? 'border-violet-500 bg-violet-50 text-violet-800'
                : index < currentIndex ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'
            }`}
          >
            {index < currentIndex ? '✓ ' : ''}{label}
          </li>
        ))}
      </ol>
      <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <div><dt>模型调用</dt><dd>{run.budgetConsumed.modelCalls}/{run.budgetSnapshot.maximumModelCalls}</dd></div>
        <div><dt>封面尝试</dt><dd>{run.budgetConsumed.coverAttempts}/{run.budgetSnapshot.maximumCoverAttempts}</dd></div>
        <div><dt>时长预算</dt><dd>{run.budgetConsumed.durationMinutes}/{run.budgetSnapshot.maximumDurationMinutes} 分钟</dd></div>
      </dl>
      {run.status === 'succeeded' && run.templateId && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          发布成功：<a className="underline" href={`/templates/${run.templateId}`}>查看模板</a>
          {run.observationUntil && <p className="mt-1">观察期至 {new Date(run.observationUntil).toLocaleString()}</p>}
        </div>
      )}
      {run.nextAllowedActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {run.nextAllowedActions.map((action) => (
            <button
              type="button"
              key={action}
              className="rounded-lg border px-3 py-2 text-sm"
              onClick={() => onAction?.(action)}
              disabled={!onAction}
            >
              {actionLabels[action]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
