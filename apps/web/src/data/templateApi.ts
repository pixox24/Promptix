import type { PromptTemplate, SortOption } from '../types/prompt';
import { api } from '../lib/api';

export type TemplateFilters = { q?:string; sort?:SortOption; outputType?:string; scenarios?:string[]; styles?:string[]; subjects?:string[]; page?:number; pageSize?:number };
export type TemplateListResponse = { items:PromptTemplate[]; page:number; pageSize:number; total:number };
export async function fetchTemplates(filters:TemplateFilters={}, signal?:AbortSignal){
  const params=new URLSearchParams(); Object.entries(filters).forEach(([k,v])=>{if(v && !Array.isArray(v))params.set(k,String(v))});
  for (const key of ['scenarios','styles','subjects'] as const) {
    const values=filters[key]; if(values?.length) params.set(key,values.join(',')); else params.delete(key);
  }
  return api<TemplateListResponse>(`/api/templates?${params}`, { signal });
}
export function fetchTemplate(id:string){return api<PromptTemplate>(`/api/templates/${encodeURIComponent(id)}`);}
