import { useState } from 'react';
import { IconChevronDown, IconCopy } from '../icons';
import { Button } from '../ui/Button';

interface PromptPreviewProps {
  prompt: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  defaultOpen?: boolean;
}

export function PromptPreview({
  prompt,
  onChange,
  onCopy,
  defaultOpen = false,
}: PromptPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);

  return (
    <div className="overflow-hidden rounded-[6px] border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50"
      >
        <div>
          <div className="text-sm font-medium text-foreground">完整 Prompt</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {open ? '点击收起' : '默认折叠，按需展开查看与编辑'}
          </div>
        </div>
        <IconChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {editing ? '编辑模式' : '预览模式'}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? '完成编辑' : '编辑'}
              </Button>
              <Button variant="secondary" size="sm" onClick={onCopy}>
                <IconCopy size={14} />
                复制
              </Button>
            </div>
          </div>

          {editing ? (
            <textarea
              value={prompt}
              onChange={(e) => onChange(e.target.value)}
              rows={8}
              className="w-full resize-y rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/25"
            />
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 px-3.5 py-3 font-mono text-[13px] leading-relaxed text-gray-700">
              {prompt || '填写变量后将在此生成完整提示词…'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
