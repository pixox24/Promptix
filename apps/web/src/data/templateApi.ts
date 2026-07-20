import type { PromptTemplate, SortOption, TemplateCategory } from '../types/prompt';
import { api } from '../lib/api';

export async function fetchTemplates(filters:{q?:string;sort?:SortOption;category?:TemplateCategory;tag?:string;scenario?:string}={}){
  const params=new URLSearchParams(); Object.entries(filters).forEach(([k,v])=>{if(v)params.set(k,v)});
  return (await api<{items:PromptTemplate[]}>(`/api/templates?${params}`)).items;
}
export function fetchTemplate(id:string){return api<PromptTemplate>(`/api/templates/${encodeURIComponent(id)}`);}
