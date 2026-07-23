import { useCallback, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveTemplateAspectRatio, validatePromptValues, type PublicGenerationJob } from '@promptix/shared';
import type { PromptTemplate, SavedDraft } from '../../types/prompt';
import { usePromptStudioState } from '../../hooks/usePromptStudioState';
import { usePublicGeneration } from '../../hooks/usePublicGeneration';
import { MediaCard } from './MediaCard';
import { VariableWorkbench } from './VariableWorkbench';
import { PromptTokenEditor } from './PromptTokenEditor';
import { GenerationActions } from './GenerationActions';
import { DraftLocker } from './DraftLocker';
import { SimilarTemplateRail } from './SimilarTemplateRail';
import { UnsavedTemplateNavigationDialog } from './UnsavedTemplateNavigationDialog';
import { TemplateGrid } from '../template/TemplateGrid';
import { shouldProtectTemplateNavigation } from '../../lib/templateDetailNavigation';
import { SimilarTemplateCompactCard } from './SimilarTemplateCompactCard';
import type { SimilarTemplateViewItem } from '../../types/recommendation';
import { recommendationTemplateTarget } from '../../lib/recommendationNavigation';

type DraftInput = Omit<SavedDraft, 'id' | 'updatedAt'> & { id?: string };
export function PromptStudioDetail({ template, similarItems, similarRequestId, generationRecommendationRequestId, onRecommendationInvalid, initialDraft, favorite, drafts, onFavorite, onSaveDraft, onDeleteDraft, onToast }: { template:PromptTemplate; similarItems:SimilarTemplateViewItem[]; similarRequestId:string|null; generationRecommendationRequestId?:string; onRecommendationInvalid:()=>void; initialDraft?:SavedDraft; favorite:boolean; drafts:SavedDraft[]; onFavorite:()=>void; onSaveDraft:(draft:DraftInput)=>string; onDeleteDraft:(id:string)=>void; onToast:(message:string,type?:'success'|'error'|'info')=>void }) {
  const {state,dispatch,prompt,isDirty}=usePromptStudioState(template,initialDraft);
  const navigate=useNavigate();
  const [pendingTemplate,setPendingTemplate]=useState<PromptTemplate|null>(null);
  const [pendingTarget,setPendingTarget]=useState<string|null>(null);
  const pendingTriggerRef=useRef<HTMLAnchorElement|null>(null);
  const onGenerated=useCallback((job:PublicGenerationJob)=>{const image=job.images?.[0];if(image)dispatch({type:'generated',image})},[dispatch]);
  const generation=usePublicGeneration(onGenerated,onRecommendationInvalid);
  const ratio=resolveTemplateAspectRatio(template.variables,state.values)?.value??'1:1';
  const change=(key:string,value:string)=>dispatch({type:'change',key,value});
  const generate=()=>{const issues=validatePromptValues(template.variables,state.values);if(issues.length){dispatch({type:'errors',errors:Object.fromEntries(issues.map(issue=>[issue.key,issue.code==='required'?`${issue.label}为必填项`:`${issue.label}选项无效`]))});onToast('请检查必填项和选项','error');return}void generation.create({templateId:template.id,values:state.values,...(state.promptMode==='manual'?{promptOverride:prompt}:{}),clientRequestId:crypto.randomUUID(),...(generationRecommendationRequestId?{recommendationRequestId:generationRecommendationRequestId}:{})})};
  const persistDraft=(announce=true)=>{const id=onSaveDraft({version:2,templateId:template.id,templateName:template.name,coverImage:template.coverImage,values:state.values,prompt,promptMode:state.promptMode,...(state.promptMode==='manual'?{manualPrompt:prompt}:{}),aspectRatio:ratio,...(state.displayedImage.kind==='generated'?{generatedImage:{url:state.displayedImage.url,width:state.displayedImage.width,height:state.displayedImage.height}}:{}) ,...(state.activeDraftId?{id:state.activeDraftId}:{})});dispatch({type:'draftSaved',id});if(announce)onToast('草稿已保存');return id};
  const save=()=>{persistDraft()};
  const copy=async()=>{try{await navigator.clipboard.writeText(prompt);onToast('提示词已复制')}catch{onToast('复制失败，请手动选择文本','error')}};
  const requestNavigation=(nextTemplate:PromptTemplate,event:MouseEvent<HTMLAnchorElement>,target=recommendationTemplateTarget(nextTemplate.id,null))=>{if(!shouldProtectTemplateNavigation(event,isDirty))return;event.preventDefault();pendingTriggerRef.current=event.currentTarget;setPendingTemplate(nextTemplate);setPendingTarget(target)};
  const cancelNavigation=useCallback(()=>{setPendingTemplate(null);setPendingTarget(null);window.setTimeout(()=>pendingTriggerRef.current?.focus(),0)},[]);
  const openPending=(saveFirst:boolean)=>{if(!pendingTemplate)return;if(saveFirst)persistDraft();const target=pendingTarget??recommendationTemplateTarget(pendingTemplate.id,null);setPendingTemplate(null);setPendingTarget(null);navigate(target)};

  return <>
    <div className="template-detail-layout">
      <SimilarTemplateRail items={similarItems.slice(0,2)} sourceTemplateId={template.id} requestId={similarRequestId} label="左侧相似模板" className="similar-template-rail-left-tall" onNavigateRequest={requestNavigation}/>
      <SimilarTemplateRail items={similarItems.slice(0,2)} sourceTemplateId={template.id} requestId={similarRequestId} label="左侧相似模板" paged pageSize={1} className="similar-template-rail-left-short" onNavigateRequest={requestNavigation}/>
      <div className="prompt-studio-detail grid items-start gap-6 lg:grid-cols-2">
        <div className="media-sticky-track"><MediaCard template={template} image={state.displayedImage} ratio={ratio} favorite={favorite} busy={generation.busy} error={generation.error} onFavorite={onFavorite}/></div>
        <div className="prompt-studio-workspace space-y-5 rounded-lg border border-slate-100 bg-white p-4 sm:p-5 lg:p-6"><VariableWorkbench variables={template.variables} values={state.values} errors={state.errors} onChange={change}/><PromptTokenEditor template={template} values={state.values} mode={state.promptMode} prompt={prompt} onChangeVariable={change} onManual={value=>dispatch({type:'manual',prompt:value})} onAuto={()=>dispatch({type:'auto'})}/><GenerationActions busy={generation.busy} canRetry={Boolean(generation.error)} onGenerate={generate} onRetry={generation.retry} onCopy={copy} onSave={save} onReset={()=>{dispatch({type:'reset',template});generation.clear()}}/><DraftLocker drafts={drafts} activeId={state.activeDraftId} onLoad={draft=>dispatch({type:'initialize',template,draft})} onDelete={onDeleteDraft}/></div>
      </div>
      <SimilarTemplateRail items={similarItems} sourceTemplateId={template.id} requestId={similarRequestId} label="右侧相似模板" paged className="similar-template-rail-single-tall" onNavigateRequest={requestNavigation}/>
      <SimilarTemplateRail items={similarItems} sourceTemplateId={template.id} requestId={similarRequestId} label="右侧相似模板" paged pageSize={1} className="similar-template-rail-single-short" onNavigateRequest={requestNavigation}/>
      <SimilarTemplateRail items={similarItems.slice(2,4)} sourceTemplateId={template.id} requestId={similarRequestId} label="右侧相似模板" className="similar-template-rail-right-tall" onNavigateRequest={requestNavigation}/>
      <SimilarTemplateRail items={similarItems.slice(2,4)} sourceTemplateId={template.id} requestId={similarRequestId} label="右侧相似模板" paged pageSize={1} className="similar-template-rail-right-short" onNavigateRequest={requestNavigation}/>
    </div>
    {similarItems.length>0&&<section className="detail-similar-bottom mt-12"><h2 className="mb-4 text-base font-semibold text-slate-800">相似模板</h2><div className="detail-similar-mobile-row -mx-4 flex gap-3 overflow-x-auto px-4 pb-3">{similarItems.map(item=><div key={item.template.id} className="w-40 shrink-0"><SimilarTemplateCompactCard item={item} sourceTemplateId={template.id} requestId={similarRequestId} onNavigateRequest={requestNavigation}/></div>)}</div><div className="detail-similar-grid"><TemplateGrid templates={similarItems.map(item=>item.template)} recommendationItems={similarItems} recommendationSourceId={template.id} recommendationRequestId={similarRequestId} onNavigateRequest={requestNavigation}/></div></section>}
    {pendingTemplate&&<UnsavedTemplateNavigationDialog templateName={pendingTemplate.name} onSaveAndOpen={()=>openPending(true)} onOpenWithoutSaving={()=>openPending(false)} onCancel={cancelNavigation}/>}
  </>;
}
