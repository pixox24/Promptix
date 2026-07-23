import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { eligibleIngestModels } from '../../lib/ingest-workflow';
import type { AdminModel } from '../../types/adminModels';
import type { IngestFlowStatus, IngestPromptConfig } from '../../types/ingest';
import { IngestEntryCard } from '../../components/admin/ingest/IngestEntryCard';
import { TextOptimizeFlow } from '../../components/admin/ingest/TextOptimizeFlow';
import { ImageReverseFlow } from '../../components/admin/ingest/ImageReverseFlow';
import { InlineAlert } from '../../components/feedback/InlineAlert';

export function IngestPage() {
  const [active, setActive] = useState<'text_expand' | 'image_reverse'>('text_expand');
  const [models, setModels] = useState<AdminModel[]>([]);
  const [prompts, setPrompts] = useState<IngestPromptConfig[]>([]);
  const [imageStatus, setImageStatus] = useState<IngestFlowStatus>('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      api<AdminModel[]>('/api/admin/models?capability=text'),
      api<IngestPromptConfig[]>('/api/admin/ingest/system-prompts'),
    ]).then(([modelRows, promptRows]) => {
      setModels(eligibleIngestModels(modelRows));
      setPrompts(promptRows);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '加载失败'));
  }, []);
  const text = prompts.find((item) => item.flowType === 'text_expand');
  const image = prompts.find((item) => item.flowType === 'image_reverse');
  if (error) return <InlineAlert type="error">{error}</InlineAlert>;
  if (!text || !image) return <p className="text-sm text-gray-500">正在加载…</p>;
  return <div>
    <h1 className="mb-6 text-2xl font-semibold">智能入库</h1>
    <div className="mb-6 grid gap-3 md:grid-cols-2">
      <IngestEntryCard title="文本优化" description="扩写并结构化提示词" active={active === 'text_expand'} status="idle" onClick={() => setActive('text_expand')} />
      <IngestEntryCard title="图片反推" description="从参考图生成模板草稿" active={active === 'image_reverse'} status={imageStatus} onClick={() => setActive('image_reverse')} />
    </div>
    <div hidden={active !== 'text_expand'}><TextOptimizeFlow models={models} prompt={text} onModelsUpdated={setModels} /></div>
    <div hidden={active !== 'image_reverse'}><ImageReverseFlow models={models} prompt={image} onModelsUpdated={setModels} onStatusChange={setImageStatus} /></div>
  </div>;
}
