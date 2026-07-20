import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PromptVariable } from '../../types/prompt';

export function InlineVariablePopover({ variable, value, open, onChange, onClose }: { variable: PromptVariable; value: string; open: boolean; onChange: (value:string)=>void; onClose:()=>void }) {
  const root = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const [draft,setDraft]=useState(value);
  useEffect(()=>{ if(!open)return; setDraft(value); requestAnimationFrame(()=>input.current?.focus()); const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onClose()}; const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()}; document.addEventListener('pointerdown',outside); document.addEventListener('keydown',key); return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[open,value,onClose]);
  return <AnimatePresence>{open&&<motion.div ref={root} role="dialog" aria-label={`编辑${variable.label}`} initial={{opacity:0,y:6,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:6,scale:.97}} className="fixed inset-x-4 bottom-4 z-50 rounded-lg border border-slate-300 bg-white p-3 text-slate-900 shadow-2xl sm:absolute sm:inset-auto sm:bottom-[calc(100%+8px)] sm:left-1/2 sm:w-72 sm:-translate-x-1/2">
    <input ref={input} value={draft} onChange={e=>{setDraft(e.target.value);onChange(e.target.value)}} className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-slate-600 focus:ring-2 focus:ring-slate-200" />
    <div className="prompt-popover-scroll mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">{variable.defaultValue&&<button type="button" className="w-full rounded-md px-2.5 py-2 text-left text-xs font-medium text-slate-800 hover:bg-slate-100" onClick={()=>{onChange(variable.defaultValue!);onClose()}}>默认：{variable.defaultValue}</button>}{variable.options?.map(option=><button type="button" key={option} className="w-full rounded-md px-2.5 py-2 text-left text-xs font-medium leading-5 text-slate-800 hover:bg-slate-100" onClick={()=>{onChange(option);onClose()}}>{option}</button>)}</div>
  </motion.div>}</AnimatePresence>;
}
