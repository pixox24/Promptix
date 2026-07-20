import { useEffect, useState } from 'react';
import { ClipboardPaste, Upload } from 'lucide-react';
import { api } from '../../../lib/api';
import { useIngestJob } from '../../../hooks/useIngestJob';
import { eligibleStructureModels, eligibleVisionModels, ingestFlowStatus, parseIngestDraft } from '../../../lib/ingest-workflow';
import type { AdminModel } from '../../../types/adminModels';
import type { IngestPromptConfig } from '../../../types/ingest';
import { TemplateDraftReview } from './TemplateDraftReview';
import { SystemPromptPanel } from './SystemPromptPanel';
import { ModelSelector } from '../ModelSelector';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function ImageReverseFlow({ models, prompt, onModelsUpdated, onStatusChange }: { models: AdminModel[]; prompt: IngestPromptConfig; onModelsUpdated: (models: AdminModel[]) => void; onStatusChange?: (status: ReturnType<typeof ingestFlowStatus>) => void }) {
  const [effectivePrompt, setEffectivePrompt] = useState(prompt);
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState('');
  const [structureModelId, setStructureModelId] = useState('');
  const [visionModelId, setVisionModelId] = useState('');
  const [error, setError] = useState('');
  const [readingClipboard, setReadingClipboard] = useState(false);
  const { job, track, retry } = useIngestJob();
  const structureModels = eligibleStructureModels(models);
  const visionModels = eligibleVisionModels(models);

  useEffect(() => {
    const preferredStructure = structureModels.find((model) => model.isDefaultText) ?? structureModels[0];
    const preferredVision = visionModels.find((model) => model.isDefaultVision) ?? visionModels[0];
    if (!structureModelId && preferredStructure) setStructureModelId(preferredStructure.id);
    if (!visionModelId && preferredVision) setVisionModelId(preferredVision.id);
  }, [structureModels, structureModelId, visionModels, visionModelId]);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptFile(candidate?: File) {
    setError('');
    if (!candidate) return;
    if (!candidate.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (candidate.size > MAX_IMAGE_BYTES) { setError('图片必须不超过 10MB'); return; }
    setFile(candidate);
  }

  function acceptPastedItems(items: DataTransferItemList) {
    const image = Array.from(items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!image) { setError('剪贴板中没有图片'); return; }
    acceptFile(image.getAsFile() ?? undefined);
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) { setError('当前浏览器不支持读取剪贴板，请聚焦上传区域后按 Ctrl/Cmd+V'); return; }
    setReadingClipboard(true);
    setError('');
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
        acceptFile(new File([blob], `clipboard-${Date.now()}.${extension}`, { type }));
        return;
      }
      setError('剪贴板中没有图片');
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError' ? '未获得剪贴板权限，请聚焦上传区域后按 Ctrl/Cmd+V' : '无法读取剪贴板图片');
    } finally { setReadingClipboard(false); }
  }

  async function submit() {
    if (!file || !structureModelId || !visionModelId) return;
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('structureModelId', structureModelId);
      body.set('visionModelId', visionModelId);
      body.set('systemPrompt', effectivePrompt.prompt);
      const result = await api<{ jobId: string }>('/api/admin/jobs/image-reverse', { method: 'POST', body });
      track(result.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交失败');
    }
  }

  const parsed = job?.status === 'succeeded' ? parseIngestDraft(job.output) : null;
  const status = ingestFlowStatus(job);
  const pipelineMessage = job?.progress?.message;
  const pipelineStages = [
    { id: 'vision', label: '图片理解' },
    { id: 'structure', label: '模板结构化' },
    { id: 'validate', label: '格式校验' },
    { id: 'quality', label: '质量检查' },
    { id: 'completed', label: '待校对' },
  ] as const;
  const stageRank: Record<string,number> = { queued: 0, vision: 1, structure: 2, repair: 2, validate: 3, quality: 4, completed: 5 };
  const currentRank = stageRank[job?.progress?.stage ?? 'queued'] ?? 0;
  const errorMessages: Record<string,string> = {
    STRUCTURE_OUTPUT_TRUNCATED:'结构化模型输出不完整，请增加输出上限或更换模型。',
    STRUCTURE_JSON_INVALID:'结构化模型没有返回可解析的 JSON，请更换结构化模型或查看诊断摘要。',
    STRUCTURE_SCHEMA_INVALID:'模型返回字段不符合模板约束。',
    VISION_REQUEST_FAILED:'视觉模型无法读取参考图片，请检查图片或更换视觉模型。',
    VISION_EMPTY_RESPONSE:'视觉模型没有返回图片描述。',
    STRUCTURE_CONTENT_FILTERED:'Provider 拒绝处理该内容，请更换图片。',
  };
  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);
  return <div className="space-y-4">
    <div className="rounded-xl border bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">视觉理解模型
        <ModelSelector models={visionModels} value={visionModelId} onChange={setVisionModelId} role="vision" disabled={status === 'queued' || status === 'running'} onModelsUpdated={onModelsUpdated} />
      </label><label className="block text-sm font-medium">模板结构化模型
        <ModelSelector models={structureModels} value={structureModelId} onChange={setStructureModelId} role="text" disabled={status === 'queued' || status === 'running'} onModelsUpdated={onModelsUpdated} />
      </label></div>
      <p className="mt-2 text-xs text-gray-500">视觉模型负责读取主体、构图与光线；结构化模型负责生成可编辑模板和 JSON。</p>
      {(!structureModels.length || !visionModels.length) && <p className="mt-2 text-sm text-amber-700">请先配置启用的视觉模型和文本结构化模型。</p>}
    </div>

    <SystemPromptPanel flowType="image_reverse" config={effectivePrompt} onChange={setEffectivePrompt} />

    <div className="rounded-xl border bg-white p-4">
      <div tabIndex={0} aria-label="参考图上传区域，可粘贴图片" className="rounded-lg outline-none focus:ring-2 focus:ring-violet-200" onClick={(event) => event.currentTarget.focus()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (status !== 'queued' && status !== 'running') acceptFile(event.dataTransfer.files[0]); }} onPaste={(event) => { event.preventDefault(); if (status !== 'queued' && status !== 'running') acceptPastedItems(event.clipboardData.items); }}>
        <label className="grid min-h-48 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-violet-400">
          {previewUrl ? <img src={previewUrl} alt="待反推图片预览" className="max-h-64 rounded-lg object-contain" /> : <span className="flex flex-col items-center gap-2 text-sm text-gray-500"><Upload size={22} />点击或拖拽上传参考图<br/><span className="text-xs text-gray-400">支持 Ctrl/Cmd+V 粘贴，最大 10MB</span></span>}
          <input hidden type="file" accept="image/*" onChange={(event) => acceptFile(event.target.files?.[0])} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-sm text-violet-700 hover:bg-violet-50 disabled:opacity-50" onClick={pasteFromClipboard} disabled={readingClipboard || status === 'queued' || status === 'running'}><ClipboardPaste size={16}/>{readingClipboard ? '读取中…' : '从剪贴板粘贴'}</button><span className="text-xs text-gray-400">也可先点击上传区再直接粘贴</span></div>
      {file && <div className="mt-3 flex items-center justify-between text-xs text-gray-500"><span className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="text-red-600" onClick={() => setFile(undefined)}>移除图片</button></div>}
      <button type="button" className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!file || !structureModelId || !visionModelId || status === 'queued' || status === 'running'} onClick={submit}>{status === 'queued' || status === 'running' ? '反推处理中…' : '执行图片反推'}</button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>

    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">反推结果</h3>
      <p className="mt-2 text-sm text-gray-500">状态：{status === 'idle' ? '未开始' : status === 'queued' ? '排队中' : status === 'running' ? (pipelineMessage ?? '处理中') : status === 'review' ? '待校对' : '失败'}</p>
      {job && <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="图片反推进度">{pipelineStages.map((stage, index) => { const reached = currentRank >= index + 1; const active = job.progress?.stage === stage.id || (job.progress?.stage === 'repair' && stage.id === 'structure'); return <li key={stage.id} className={`border-t-2 pt-1 text-center text-[10px] sm:text-xs ${active ? 'border-violet-600 font-medium text-violet-700' : reached ? 'border-emerald-500 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>{stage.label}</li>})}</ol>}
      {job?.errorMessage && <p className="mt-3 text-sm text-red-600">{job.errorCode ? (errorMessages[job.errorCode] ?? job.errorMessage) : job.errorMessage}</p>}
      {job?.errorDetails && <details className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">诊断摘要</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{job.errorDetails.finishReason && <><dt>结束原因</dt><dd>{job.errorDetails.finishReason}</dd></>}{job.errorDetails.outputLength !== undefined && <><dt>输出长度</dt><dd>{job.errorDetails.outputLength}</dd></>}{job.errorDetails.outputTokens !== undefined && <><dt>输出 Token</dt><dd>{job.errorDetails.outputTokens}</dd></>}{job.errorDetails.parseMessage && <><dt>解析错误</dt><dd className="break-words">{job.errorDetails.parseMessage}</dd></>}</dl></details>}
      {status === 'failed' && job?.errorDetails?.retryable !== false && <button type="button" className="mt-3 text-sm text-violet-600" onClick={() => retry()}>重试</button>}
      {job?.status === 'succeeded' && parsed && !parsed.success && <p className="mt-3 text-sm text-amber-700">结果格式异常，无法保存为模板。</p>}
      {parsed?.success && <div className="mt-4"><TemplateDraftReview draft={parsed.data} jobId={job!.id} source="image_reverse" qualityIssues={job?.resultMeta?.qualityIssues} /></div>}
    </div>
  </div>;
}
