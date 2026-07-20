import { useCallback } from 'react';
import { resolveTemplateAspectRatio, validatePromptValues, type PublicGenerationJob } from '@promptix/shared';
import type { PromptTemplate, SavedDraft } from '../../types/prompt';
import { usePromptStudioState } from '../../hooks/usePromptStudioState';
import { usePublicGeneration } from '../../hooks/usePublicGeneration';
import { MediaCard } from './MediaCard';
import { VariableWorkbench } from './VariableWorkbench';
import { PromptTokenEditor } from './PromptTokenEditor';
import { GenerationActions } from './GenerationActions';
import { DraftLocker } from './DraftLocker';

type DraftInput = Omit<SavedDraft, 'id' | 'updatedAt'> & { id?: string };
export function PromptStudioDetail({ template, initialDraft, favorite, drafts, onFavorite, onSaveDraft, onDeleteDraft, onToast }: { template:PromptTemplate; initialDraft?:SavedDraft; favorite:boolean; drafts:SavedDraft[]; onFavorite:()=>void; onSaveDraft:(draft:DraftInput)=>string; onDeleteDraft:(id:string)=>void; onToast:(message:string,type?:'success'|'error'|'info')=>void }) {
  const {state,dispatch,prompt}=usePromptStudioState(template,initialDraft);
  const onGenerated=useCallback((job:PublicGenerationJob)=>{const image=job.images?.[0];if(image)dispatch({type:'generated',image})},[dispatch]);
  const generation=usePublicGeneration(onGenerated);
  const ratio=resolveTemplateAspectRatio(template.variables,state.values)?.value??'1:1';
  const change=(key:string,value:string)=>dispatch({type:'change',key,value});
  const generate=()=>{const issues=validatePromptValues(template.variables,state.values);if(issues.length){dispatch({type:'errors',errors:Object.fromEntries(issues.map(issue=>[issue.key,issue.code==='required'?`${issue.label}为必填项`:`${issue.label}选项无效`]))});onToast('请检查必填项和选项','error');return}void generation.create({templateId:template.id,values:state.values,...(state.promptMode==='manual'?{promptOverride:prompt}:{}),clientRequestId:crypto.randomUUID()})};
  const save=()=>{const id=onSaveDraft({version:2,templateId:template.id,templateName:template.name,coverImage:template.coverImage,values:state.values,prompt,promptMode:state.promptMode,...(state.promptMode==='manual'?{manualPrompt:prompt}:{}),aspectRatio:ratio,...(state.displayedImage.kind==='generated'?{generatedImage:{url:state.displayedImage.url,width:state.displayedImage.width,height:state.displayedImage.height}}:{}) ,...(state.activeDraftId?{id:state.activeDraftId}:{})});dispatch({type:'draftSaved',id});onToast('草稿已保存')};
  const copy=async()=>{try{await navigator.clipboard.writeText(prompt);onToast('提示词已复制')}catch{onToast('复制失败，请手动选择文本','error')}};
  return <div className="prompt-studio-detail grid items-start gap-6 lg:grid-cols-2 lg:items-stretch">
    <MediaCard template={template} image={state.displayedImage} ratio={ratio} favorite={favorite} busy={generation.busy} error={generation.error} onFavorite={onFavorite}/>
    <div className="prompt-studio-workspace space-y-5 rounded-lg border border-slate-100 bg-white p-4 sm:p-5 lg:p-6"><VariableWorkbench variables={template.variables} values={state.values} errors={state.errors} onChange={change}/><PromptTokenEditor template={template} values={state.values} mode={state.promptMode} prompt={prompt} onChangeVariable={change} onManual={value=>dispatch({type:'manual',prompt:value})} onAuto={()=>dispatch({type:'auto'})}/><GenerationActions busy={generation.busy} canRetry={Boolean(generation.error)} onGenerate={generate} onRetry={generation.retry} onCopy={copy} onSave={save} onReset={()=>{dispatch({type:'reset',template});generation.clear()}}/><DraftLocker drafts={drafts} activeId={state.activeDraftId} onLoad={draft=>dispatch({type:'initialize',template,draft})} onDelete={onDeleteDraft}/></div>
  </div>;
}
