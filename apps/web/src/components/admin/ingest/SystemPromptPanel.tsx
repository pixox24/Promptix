import { useState } from 'react';
import type { IngestFlowType } from '@promptix/shared';
import { api } from '../../../lib/api';
import type { IngestPromptConfig } from '../../../types/ingest';
import { useToast } from '../../../context/ToastContext';

export function SystemPromptPanel({
  flowType,
  config,
  onChange,
}: {
  flowType: IngestFlowType;
  config: IngestPromptConfig;
  onChange: (config: IngestPromptConfig) => void;
}) {
  const [value, setValue] = useState(config.prompt);
  const { toast } = useToast();

  async function save(global: boolean) {
    try {
      if (global) {
        const next = await api<IngestPromptConfig>(`/api/admin/ingest/system-prompts/${flowType}`, {
          method: 'PUT',
          body: JSON.stringify({ prompt: value }),
        });
        onChange(next);
        toast('已保存为系统提示词', 'success');
      } else {
        toast('仅本次流程使用当前修改', 'info');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '保存失败', 'error');
    }
  }

  return <div className="rounded-xl border bg-white p-4">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold">系统提示词</h3>
      <button type="button" className="text-xs text-violet-600" onClick={() => {
        setValue(config.prompt);
        toast('已恢复全局预设', 'info');
      }}>恢复全局预设</button>
    </div>
    <textarea className="mt-3 min-h-32 w-full rounded-lg border p-3 text-sm" value={value} onChange={(event) => setValue(event.target.value)}/>
    <div className="mt-3 flex items-center gap-3">
      <button type="button" className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white" onClick={() => save(true)}>保存为系统提示词</button>
      <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => save(false)}>仅本次修改</button>
    </div>
  </div>;
}
