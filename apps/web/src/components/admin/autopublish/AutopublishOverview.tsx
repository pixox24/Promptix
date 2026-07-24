import type { AutopublishRunView } from '../../../types/autopublish';

export function AutopublishOverview({
  runs,
  observations,
}: {
  runs: AutopublishRunView[];
  observations: Array<Record<string, unknown>>;
}) {
  const succeeded = runs.filter((run) => run.status === 'succeeded').length;
  const exceptions = runs.filter((run) => ['needs_attention', 'failed', 'rejected', 'conflict_waiting'].includes(run.status)).length;
  const active = runs.filter((run) => ['queued', 'running'].includes(run.status));
  const delegated = runs.filter((run) => run.triggerType === 'delegated').length;
  const scheduled = runs.filter((run) => run.triggerType === 'scheduled_agent').length;
  const usage = runs.length
    ? (runs.reduce((sum, run) => sum + run.budgetConsumed.modelCalls, 0) / runs.length).toFixed(1)
    : '0';

  const cards = [
    ['今日运行', runs.length],
    ['已发布', succeeded],
    ['成功率', runs.length ? `${Math.round((succeeded / runs.length) * 100)}%` : '—'],
    ['异常率', runs.length ? `${Math.round((exceptions / runs.length) * 100)}%` : '—'],
    ['平均模型调用', usage],
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">触发来源</h2>
          <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>用户委托</dt><dd>{delegated}</dd></div><div className="flex justify-between"><dt>Agent 主动</dt><dd>{scheduled}</dd></div></dl>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">当前运行</h2>
          <p className="mt-3 text-2xl font-semibold">{active.length}</p>
          <p className="mt-1 text-xs text-slate-500">排队和执行中的任务</p>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">观察中的模板</h2>
          <p className="mt-3 text-2xl font-semibold">{observations.length}</p>
          <p className="mt-1 text-xs text-slate-500">发布后 72 小时观察窗口</p>
        </section>
      </div>
    </>
  );
}
