import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Options={title:string;description:string;confirmLabel?:string;danger?:boolean};
const Context=createContext<((options:Options)=>Promise<boolean>)|null>(null);

export function ConfirmDialogProvider({children}:{children:ReactNode}){
 const [options,setOptions]=useState<Options|null>(null); const resolveRef=useRef<((value:boolean)=>void)|null>(null);
 const confirm=useCallback((next:Options)=>new Promise<boolean>((resolve)=>{resolveRef.current=resolve;setOptions(next)}),[]);
 const close=(value:boolean)=>{resolveRef.current?.(value);resolveRef.current=null;setOptions(null)};
 return <Context.Provider value={confirm}>{children}{options&&<div className="fixed inset-0 z-[200] grid place-items-center bg-gray-950/45 p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-lg border bg-white p-6 shadow-2xl"><h2 id="confirm-title" className="text-lg font-semibold">{options.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-600">{options.description}</p><div className="mt-6 flex justify-end gap-3"><button autoFocus className="rounded-lg border px-4 py-2 text-sm" onClick={()=>close(false)}>取消</button><button className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${options.danger?'bg-red-600 hover:bg-red-700':'bg-violet-600 hover:bg-violet-700'}`} onClick={()=>close(true)}>{options.confirmLabel??'确认'}</button></div></div></div>}</Context.Provider>;
}
export function useConfirmDialog(){const value=useContext(Context);if(!value)throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');return value}
