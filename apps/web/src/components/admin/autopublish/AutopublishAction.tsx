import { useState } from 'react';
import {
  createImageAutopublishRun,
  createTextAutopublishRun,
} from '../../../data/autopublishApi';

type CommonProps = {
  initialAllowAutomaticRepair?: boolean;
  disabled?: boolean;
  onRunCreated: (runId: string) => void;
};

export type AutopublishActionProps = CommonProps & (
  | { flowType: 'text_expand'; text: string; modelId: string }
  | {
      flowType: 'image_reverse';
      file: File;
      modelId: string;
      visionModelId: string;
    }
);

export function AutopublishAction(props: AutopublishActionProps) {
  const [allowAutomaticRepair, setAllowAutomaticRepair] = useState(
    props.initialAllowAutomaticRepair ?? true,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = props.flowType === 'text_expand'
        ? await createTextAutopublishRun({
            flowType: 'text_expand',
            text: props.text,
            modelId: props.modelId,
            allowAutomaticRepair,
            idempotencyKey,
          })
        : await createImageAutopublishRun({
            file: props.file,
            modelId: props.modelId,
            visionModelId: props.visionModelId,
            allowAutomaticRepair,
            idempotencyKey,
          });
      props.onRunCreated(response.runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '自动发布任务提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-violet-950">跳过人工校对，运行完整发布链路</p>
          <p className="mt-1 text-xs text-violet-700">任务会在后台继续运行，可以随时离开此页面。</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={props.disabled || submitting}
          onClick={submit}
        >
          {submitting ? '正在创建…' : '一键自动发布'}
        </button>
      </div>
      <details className="mt-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">高级选项</summary>
        <div className="mt-3 space-y-2 rounded-lg bg-white p-3">
          <p>结构模型：{props.modelId || '尚未选择'}</p>
          {props.flowType === 'image_reverse' && <p>视觉模型：{props.visionModelId || '尚未选择'}</p>}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowAutomaticRepair}
              onChange={(event) => setAllowAutomaticRepair(event.target.checked)}
            />
            允许在校验失败时自动修复（仅本次任务）
          </label>
          <p className="text-xs text-slate-500">
            单次预算由系统规则冻结：最多 6 次模型调用、2 次封面尝试、10 分钟。
          </p>
        </div>
      </details>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
