import { recommendationContextSchema } from '@promptix/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchTemplate } from '../data/templateApi';
import type { PromptTemplate } from '../types/prompt';
import { useLibrary } from '../context/UserLibraryContext';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/ui/EmptyState';
import { PromptStudioDetail } from '../components/detail/PromptStudioDetail';
import { useSimilarTemplates } from '../hooks/useSimilarTemplates';

export function DetailPage() {
  const {id}=useParams<{id:string}>(); const [search,setSearch]=useSearchParams();
  const [template,setTemplate]=useState<PromptTemplate|undefined>(); const [loading,setLoading]=useState(true);
  const library=useLibrary(); const {toast}=useToast(); const draftId=search.get('draft');
  useEffect(()=>{if(!id){setLoading(false);return}let active=true;setLoading(true);fetchTemplate(id).then(value=>{if(active)setTemplate(value)}).catch(()=>{if(active)setTemplate(undefined)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id]);
  useEffect(()=>{if(template)library.addRecent(template.id)},[template?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const initialDraft=useMemo(()=>draftId?library.getDraft(draftId):undefined,[draftId,library]);
  const similar=useSimilarTemplates(template);
  const generationRecommendationRequestId=useMemo(()=>{
    const value=search.get('recRequest');
    if(!value)return undefined;
    const parsed=recommendationContextSchema.safeParse({recommendationRequestId:value});
    return parsed.success?parsed.data.recommendationRequestId:undefined;
  },[search]);
  const clearRecommendationContext=useCallback(()=>{
    const next=new URLSearchParams(search);
    next.delete('recRequest');
    setSearch(next,{replace:true});
  },[search,setSearch]);
  if(loading&&!template)return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-slate-400">正在加载模板…</div>;
  if(!template)return <div className="mx-auto max-w-6xl px-4 py-16"><EmptyState title="模板不存在" description="该模板可能已被移除，或链接不正确。" actionLabel="返回模板库" actionTo="/library"/></div>;
  const favorite=library.isFavorite(template.id);
  return <main className="mx-auto max-w-[2240px] px-4 pb-12 pt-4 md:px-8"><PromptStudioDetail template={template} similarItems={similar.items} similarRequestId={similar.requestId} similarUnavailable={similar.unavailable} generationRecommendationRequestId={generationRecommendationRequestId} onRecommendationInvalid={clearRecommendationContext} initialDraft={initialDraft} favorite={favorite} drafts={library.listDraftsForTemplate(template.id)} onFavorite={()=>{library.toggleFavorite(template.id);toast(favorite?'已取消收藏':'已收藏模板')}} onSaveDraft={library.saveDraft} onDeleteDraft={draftId=>{library.deleteDraft(draftId);toast('草稿已删除','info')}} onToast={toast}/></main>;
}
