import { useEffect, useState } from 'react';
import type { AdminModel } from '../../../types/adminModels';
import type { IngestPromptConfig } from '../../../types/ingest';
import { api } from '../../../lib/api';
import { eligibleStructureModels, ingestFlowStatus, parseIngestDraft } from '../../../lib/ingest-workflow';
import { useIngestJob } from '../../../hooks/useIngestJob';
import { useToast } from '../../../context/ToastContext';
import { ModelSelector } from '../ModelSelector';
import { SystemPromptPanel } from './SystemPromptPanel';
import { TemplateDraftReview } from './TemplateDraftReview';

export function TextOptimizeFlow({
  models,
  prompt,
  onModelsUpdated,
}: {
  models: AdminModel[];
  prompt: IngestPromptConfig;
  onModelsUpdated: (models: AdminModel[]) => void;
}) {
  const [effectivePrompt, setEffectivePrompt] = useState(prompt);
  const [text, setText] = useState('');
  const eligible = eligibleStructureModels(models);
  const [modelId, setModelId] = useState('');
  const { job, track, retry } = useIngestJob();
  const { toast } = useToast();

  useEffect(() => {
    if (!modelId) setModelId(eligible.find(m=>m.isDefaultText)?.id ?? eligible[0]?.id ?? '');
  }, [eligible, modelId]);

  async function submit() {
    try {
      const result = await api<{ jobId: string }>('/api/admin/jobs', {
        method: 'POST',
        body: JSON.stringify({
          type: 'text_expand',
          modelId,
          input: { text, systemPrompt: effectivePrompt.prompt },
        }),
      });
      track(result.jobId);
      toast('文本优化任务已提交', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '提交失败', 'error');
    }
  }

  const parsed = job?.status === 'succeeded' ? parseIngestDraft(job.output) : null;
  return <div className="space-y-4">
    <SystemPromptPanel flowType="text_expand" config={effectivePrompt} onChange={setEffectivePrompt}/>
    <div className="rounded-xl border bg-white p-4">
      <label className="block text-sm">模型
        <ModelSelector models={eligible} value={modelId} onChange={setModelId} role="text" onModelsUpdated={onModelsUpdated}/>
      </label>
      <textarea className="mt-3 min-h-40 w-full rounded border p-3" value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴提示词或创意需求"/>
      <button className="mt-3 rounded bg-violet-600 px-4 py-2 text-sm text-white" disabled={!text} onClick={submit}>提交优化</button>
      <p className="mt-3 text-sm text-gray-500">状态：{ingestFlowStatus(job)}</p>
      {job?.status === 'failed' && <button className="text-sm text-violet-600" onClick={() => retry()}>重试</button>}
    </div>
    {parsed?.success && <TemplateDraftReview draft={parsed.data} jobId={job?.id ?? ''} source="text_expand"/>}
  </div>;
}
