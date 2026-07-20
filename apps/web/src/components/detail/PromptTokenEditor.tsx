import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { parsePromptTemplateSegments } from '@promptix/shared';
import type { PromptTemplate } from '../../types/prompt';
import { InlineVariablePopover } from './InlineVariablePopover';

const colors = [
  'bg-cyan-400/15 text-cyan-200',
  'bg-amber-400/15 text-amber-200',
  'bg-emerald-400/15 text-emerald-200',
  'bg-rose-400/15 text-rose-200',
  'bg-violet-400/15 text-violet-200',
];

function ManualPromptHighlight({ prompt, template, values }: { prompt:string; template:PromptTemplate; values:Record<string,string> }) {
  const tokens = template.variables
    .map((variable, index) => ({ value: values[variable.key] ?? '', index }))
    .filter((token) => token.value)
    .sort((a, b) => b.value.length - a.value.length);
  if (!tokens.length) return <>{prompt}</>;
  const pattern = new RegExp(`(${tokens.map((token) => token.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return <>{prompt.split(pattern).map((part, index) => {
    const token = tokens.find((item) => item.value === part);
    return token ? <mark key={index} className={`rounded px-1 text-inherit ${colors[token.index % colors.length]}`}>{part}</mark> : <span key={index}>{part}</span>;
  })}</>;
}

export function PromptTokenEditor({ template, values, mode, prompt, onChangeVariable, onManual, onAuto }: { template: PromptTemplate; values:Record<string,string>; mode:'auto'|'manual'; prompt:string; onChangeVariable:(key:string,value:string)=>void; onManual:(prompt:string)=>void; onAuto:()=>void }) {
  const segments = useMemo(() => parsePromptTemplateSegments(template), [template]);
  const [open, setOpen] = useState<string|null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const tokenRefs = useRef<Record<string,HTMLButtonElement|null>>({});
  const textarea = useRef<HTMLTextAreaElement>(null);
  const close = () => { const key=open; setOpen(null); requestAnimationFrame(() => key && tokenRefs.current[key]?.focus()); };
  const startEditing = () => { setDraft(prompt); setEditing(true); };
  const confirmEditing = () => { onManual(draft); setEditing(false); };
  const restoreAuto = () => { setEditing(false); onAuto(); };

  useLayoutEffect(() => {
    if (!editing || !textarea.current) return;
    textarea.current.style.height = '0px';
    textarea.current.style.height = `${Math.max(112, textarea.current.scrollHeight)}px`;
  }, [draft, editing]);

  return <section className="rounded-lg bg-slate-950 p-4 text-slate-200" aria-label="Prompt 编辑器">
    <div className="mb-3 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-400">PROMPT</span>
      {editing ? <button type="button" onClick={confirmEditing} className="rounded-md p-1 text-emerald-400 hover:bg-white/10 hover:text-emerald-300" aria-label="确认编辑"><Check size={16}/></button> : <div className="flex gap-1">
        {mode === 'manual' && <button type="button" onClick={restoreAuto} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="恢复自动模式"><RotateCcw size={16}/></button>}
        <button type="button" onClick={startEditing} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="手工编辑"><Pencil size={16}/></button>
      </div>}
    </div>

    {editing ? <div className="relative min-h-28 rounded-md border border-slate-700 bg-slate-900 focus-within:border-slate-500">
      <div aria-hidden className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6 text-slate-200"><ManualPromptHighlight prompt={draft} template={template} values={values}/></div>
      <textarea ref={textarea} value={draft} onChange={(event) => setDraft(event.target.value)} className="relative z-10 block min-h-28 w-full resize-none overflow-hidden bg-transparent p-3 font-mono text-xs leading-6 text-transparent caret-white outline-none selection:bg-sky-500/40" aria-label="编辑 Prompt" />
    </div> : mode === 'manual' ? <div className="min-h-28 whitespace-pre-wrap break-words font-mono text-xs leading-7"><ManualPromptHighlight prompt={prompt} template={template} values={values}/></div> : <div className="min-h-28 font-mono text-xs leading-7">{segments.map((segment,index)=>segment.type==='text'?<span key={index}>{segment.value}</span>:(()=>{const variable=template.variables.find(v=>v.key===segment.key)!;return <span key={`${segment.key}-${index}`} className="relative inline-block"><button ref={node=>{tokenRefs.current[segment.key]=node}} type="button" onClick={()=>setOpen(segment.key)} className={`mx-0.5 rounded px-1.5 py-0.5 underline decoration-current/40 ${colors[index%colors.length]}`}>{values[segment.key]||variable.label}</button><InlineVariablePopover variable={variable} value={values[segment.key]??''} open={open===segment.key} onChange={value=>onChangeVariable(segment.key,value)} onClose={close}/></span>})())}</div>}
  </section>;
}
