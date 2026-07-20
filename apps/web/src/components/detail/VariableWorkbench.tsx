import { Circle, Diamond, Sun } from 'lucide-react';
import type { PromptVariable } from '../../types/prompt';

export function VariableWorkbench({ variables, values, errors, onChange }: { variables: PromptVariable[]; values: Record<string,string>; errors: Record<string,string>; onChange: (key:string,value:string)=>void }) {
  return <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="提示词变量">
    {variables.map(variable => {
      const full = variable.type === 'select' || variable.type === 'ratio' || variable.type === 'image';
      const options = variable.options ?? [];
      const suggestions = variable.suggestions?.length ? variable.suggestions : variable.type === 'text' ? options : [];
      return <div key={variable.key} className={full ? 'sm:col-span-2' : ''}>
        <label htmlFor={`variable-${variable.key}`} className="mb-1.5 block text-xs font-semibold text-slate-600">{variable.label}{variable.required && <span className="ml-1 text-red-500">*</span>}</label>
        {(variable.type === 'text' || variable.type === 'number' || variable.type === 'image') && <input id={`variable-${variable.key}`} type={variable.type === 'number' ? 'number' : variable.type === 'image' ? 'url' : 'text'} value={values[variable.key] ?? ''} onChange={e=>onChange(variable.key,e.target.value)} placeholder={variable.placeholder} className={`h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:border-slate-500 ${errors[variable.key] ? 'border-red-400' : 'border-slate-200'}`} />}
        {(variable.type === 'select' || variable.type === 'ratio') && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{options.map(option => { const active=values[variable.key]===option; const Icon = /light/i.test(variable.key) ? Sun : variable.key==='style' ? Diamond : Circle; return <button type="button" key={option} onClick={()=>onChange(variable.key,option)} className={`flex min-h-10 items-center justify-center gap-2 rounded-md border px-2 text-xs transition-colors ${active?'border-slate-900 bg-slate-900 text-white':'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}><Icon size={13}/><span className="truncate">{option}</span></button>})}</div>}
        {(variable.type === 'text' || variable.type === 'number') && suggestions.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${variable.label}推荐值`}>{suggestions.map(option=><button type="button" key={option} aria-pressed={values[variable.key] === option} onClick={()=>onChange(variable.key,option)} className={`max-w-full rounded-md border px-2 py-1 text-left text-[11px] leading-snug transition-colors ${values[variable.key] === option ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400 hover:bg-slate-100'}`}>{option}</button>)}</div>}
        {errors[variable.key] && <p className="mt-1 text-xs text-red-600">{errors[variable.key]}</p>}
      </div>;
    })}
  </section>;
}
