import { Hono, type Context } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  jobTypeSchema,
  ingestFlowTypeSchema,
  modelCapabilitySchema,
  type JobType,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { generationJobs, mediaObjects, providerModels, providers, promptTemplates } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';
import { getJobQueue } from '../lib/queue.js';
import { enqueueGenerationJob, retryEnqueueOptions } from '../lib/job-enqueue.js';
import { deleteObject, putObject, storageKind } from '../lib/storage.js';
import { effectiveIngestSystemPrompt, loadIngestSystemPrompt } from '../lib/ingest-system-prompts.js';
import { buildTemplateCoverRequest } from '../lib/template-cover.js';
import { loadActiveTaxonomySnapshot } from '../lib/taxonomy.js';
import {
  clearTerminalQueueJobForRetry,
  QueueJobStillRunningError,
} from '../lib/job-retry.js';
import {
  defaultRoleForJob,
  selectLegacyModelCandidate,
  supportsJobType,
} from '../lib/job-model-selection.js';

const jobInput = z.object({
  type: jobTypeSchema,
  input: z.record(z.unknown()).default({}),
  modelId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  templateId: z.string().optional(),
});

async function validatedModel(jobType: JobType, modelId?: string, legacyProviderId?: string) {
  const role = defaultRoleForJob(jobType);
  if (!role) return { modelId: undefined, providerId: undefined };

  if (modelId) {
    const [row] = await getDb().select({
      model: providerModels,
      providerEnabled: providers.enabled,
    }).from(providerModels)
      .innerJoin(providers, eq(providerModels.providerId, providers.id))
      .where(eq(providerModels.id, modelId))
      .limit(1);
    if (!row) throw new Error('MODEL_NOT_FOUND');
    if (!row.model.enabled || !row.providerEnabled) throw new Error('MODEL_DISABLED');
    if (legacyProviderId && legacyProviderId !== row.model.providerId) {
      throw new Error('MODEL_PROVIDER_MISMATCH');
    }
    const candidate = {
      ...row.model,
      capabilities: modelCapabilitySchema.array().parse(row.model.capabilities),
    };
    if (!supportsJobType(candidate, jobType)) throw new Error('MODEL_CAPABILITY_MISMATCH');
    return { modelId: row.model.id, providerId: row.model.providerId };
  }

  if (legacyProviderId) {
    const [provider] = await getDb().select({
      id: providers.id,
      enabled: providers.enabled,
      defaultModel: providers.defaultModel,
    }).from(providers).where(eq(providers.id, legacyProviderId)).limit(1);
    if (!provider) throw new Error('PROVIDER_NOT_FOUND');
    if (!provider.enabled) throw new Error('MODEL_DISABLED');

    const models = await getDb().select().from(providerModels)
      .where(and(
        eq(providerModels.providerId, legacyProviderId),
        eq(providerModels.enabled, true),
      ))
      .orderBy(asc(providerModels.createdAt));
    const candidates = models.map((model) => ({
      ...model,
      capabilities: modelCapabilitySchema.array().parse(model.capabilities),
    }));
    const selected = selectLegacyModelCandidate(
      candidates,
      jobType,
      provider.defaultModel,
    );
    if (!selected) throw new Error('MODEL_CAPABILITY_MISMATCH');
    return { modelId: selected.id, providerId: selected.providerId };
  }

  const roleColumn = role === 'text'
    ? providerModels.isDefaultText
    : providerModels.isDefaultImage;
  const [row] = await getDb().select({
    model: providerModels,
    providerEnabled: providers.enabled,
  }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(roleColumn, true),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .limit(1);
  if (!row) throw new Error('DEFAULT_MODEL_NOT_CONFIGURED');
  const candidate = {
    ...row.model,
    capabilities: modelCapabilitySchema.array().parse(row.model.capabilities),
  };
  if (!supportsJobType(candidate, jobType)) throw new Error('MODEL_CAPABILITY_MISMATCH');
  return { modelId: row.model.id, providerId: row.model.providerId };
}

async function validatedVisionModel(modelId?: string) {
  const where = modelId
    ? eq(providerModels.id, modelId)
    : eq(providerModels.isDefaultVision, true);
  const [row] = await getDb().select({
    model: providerModels,
    providerEnabled: providers.enabled,
  }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(where, eq(providerModels.enabled, true), eq(providers.enabled, true)))
    .limit(1);
  if (!row) throw new Error(modelId ? 'MODEL_NOT_FOUND' : 'DEFAULT_VISION_MODEL_NOT_CONFIGURED');
  const capabilities = modelCapabilitySchema.array().parse(row.model.capabilities);
  if (!capabilities.includes('text') || !capabilities.includes('vision')) {
    throw new Error('MODEL_CAPABILITY_MISMATCH');
  }
  return { modelId: row.model.id, providerId: row.model.providerId };
}

function modelValidationFailure(c: Context, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'MODEL_NOT_FOUND':
      return fail(c, code, 'Model not found', 404);
    case 'PROVIDER_NOT_FOUND':
      return fail(c, code, 'Provider not found', 404);
    case 'MODEL_DISABLED':
      return fail(c, code, 'Model or provider is disabled', 409);
    case 'MODEL_PROVIDER_MISMATCH':
      return fail(c, code, 'modelId and providerId refer to different providers', 409);
    case 'MODEL_CAPABILITY_MISMATCH':
      return fail(c, code, 'Model does not support this job type', 409);
    case 'DEFAULT_MODEL_NOT_CONFIGURED':
      return fail(c, code, 'No enabled default model is configured for this job type', 409);
    case 'DEFAULT_VISION_MODEL_NOT_CONFIGURED':
      return fail(c, code, 'No enabled default vision model is configured', 409);
    default:
      throw error;
  }
}

export const jobRoutes = new Hono<AdminVars>();
jobRoutes.use('*',requireAdmin);
jobRoutes.get('/',async(c)=>{
  const status=c.req.query('status');
  const rows=await getDb().select().from(generationJobs).where(status?eq(generationJobs.status,status):undefined).orderBy(desc(generationJobs.createdAt)).limit(200);
  return ok(c,rows);
});
jobRoutes.post('/',async(c)=>{
  const parsed=jobInput.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message ?? 'Invalid job',400);
  if(parsed.data.type==='provider_test') return fail(c,'TEST_ROUTE_REQUIRED','Use the provider test endpoint to create provider_test jobs.',400);
  if(parsed.data.type==='text_expand' && typeof parsed.data.input.text!=='string') return fail(c,'TEXT_REQUIRED','input.text is required',400);
  const admin=c.get('admin');
  let selection: { modelId?: string; providerId?: string };
  try {
    selection = await validatedModel(
      parsed.data.type,
      parsed.data.modelId,
      parsed.data.providerId,
    );
  } catch (error) {
    return modelValidationFailure(c, error);
  }
  let resolvedInput = parsed.data.input;
  if (parsed.data.type === 'image_generate' && parsed.data.templateId) {
    const [template] = await getDb().select().from(promptTemplates).where(eq(promptTemplates.id, parsed.data.templateId)).limit(1);
    if (!template) return fail(c, 'NOT_FOUND', 'Template not found', 404);
    try {
      const request = buildTemplateCoverRequest(template, 'template_revision_cover');
      resolvedInput = { ...parsed.data.input, ...request };
    } catch (error) {
      return fail(c, error instanceof Error && ['TEMPLATE_UNRESOLVED', 'TEMPLATE_UNKNOWN_VARIABLE'].includes(error.message) ? error.message : 'TEMPLATE_INVALID', 'Template cannot be converted into a cover request', 422);
    }
  }
  const ingestFlow = ingestFlowTypeSchema.safeParse(parsed.data.type);
  if (ingestFlow.success) {
    try {
      const configured = await loadIngestSystemPrompt(ingestFlow.data);
      const taxonomy = await loadActiveTaxonomySnapshot();
      resolvedInput = {
        ...parsed.data.input,
        systemPrompt: effectiveIngestSystemPrompt(
          ingestFlow.data,
          parsed.data.input.systemPrompt,
          configured,
        ),
        taxonomySnapshot: taxonomy.snapshot,
        taxonomySnapshotHash: taxonomy.hash,
      };
    } catch (error) {
      return fail(c, 'INVALID_SYSTEM_PROMPT', error instanceof Error ? error.message : 'Invalid system prompt', 400);
    }
  }
  const [row]=await getDb().insert(generationJobs).values({
    type: parsed.data.type,
    input: resolvedInput,
    templateId: parsed.data.templateId,
    modelId: selection.modelId,
    providerId: selection.providerId,
    status:'pending',
    actorId:admin.sub,
  }).returning();
  try { await enqueueGenerationJob(row.id); } catch(e) {
    await getDb().update(generationJobs).set({status:'failed',errorMessage:e instanceof Error?e.message:'Queue unavailable',finishedAt:new Date()}).where(eq(generationJobs.id,row.id));
    return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);
  }
  return ok(c,{jobId:row.id,status:'queued'},202);
});
jobRoutes.post('/image-reverse',async(c)=>{
  const body=await c.req.parseBody(); const file=body.file; const providerId=typeof body.providerId==='string'?body.providerId:undefined;
  const modelId = typeof body.structureModelId === 'string' ? body.structureModelId : typeof body.modelId === 'string' ? body.modelId : undefined;
  const visionModelId = typeof body.visionModelId === 'string' ? body.visionModelId : undefined;
  if(!(file instanceof File)||!file.type.startsWith('image/')) return fail(c,'IMAGE_REQUIRED','An image file is required',400);
  if(file.size>10*1024*1024)return fail(c,'FILE_TOO_LARGE','Image must be at most 10MB',413);
  const admin=c.get('admin'); const db=getDb();
  let selection: { modelId?: string; providerId?: string };
  let visionSelection: { modelId: string; providerId: string };
  try {
    selection = await validatedModel('image_reverse', modelId, providerId);
    visionSelection = await validatedVisionModel(visionModelId);
  } catch (error) {
    return modelValidationFailure(c, error);
  }
  let systemPrompt: string;
  let taxonomy: Awaited<ReturnType<typeof loadActiveTaxonomySnapshot>>;
  try {
    const configured = await loadIngestSystemPrompt('image_reverse');
    systemPrompt = effectiveIngestSystemPrompt('image_reverse', body.systemPrompt, configured);
    taxonomy = await loadActiveTaxonomySnapshot();
  } catch (error) {
    return fail(c, 'INVALID_SYSTEM_PROMPT', error instanceof Error ? error.message : 'Invalid system prompt', 400);
  }
  const [row]=await db.insert(generationJobs).values({
    type:'image_reverse',
    status:'pending',
    actorId:admin.sub,
    modelId: selection.modelId,
    providerId: selection.providerId,
    visionModelId: visionSelection.modelId,
    progress:{stage:'queued',percent:0,message:'等待处理',updatedAt:new Date().toISOString()},
    input:{ systemPrompt, taxonomySnapshot: taxonomy.snapshot, taxonomySnapshotHash: taxonomy.hash },
  }).returning();
  const ext=file.type.split('/')[1]?.replace('jpeg','jpg')??'bin'; const key=`temp/inputs/${row.id}/source.${ext}`;
  const stored=await putObject(key,Buffer.from(await file.arrayBuffer()),file.type);
  await db.insert(mediaObjects).values({objectKey:key,bucket:storageKind(),url:stored.url,storageClass:'temp',prefixKind:'input',expiresAt:new Date(Date.now()+7*86400000),jobId:row.id,mime:file.type,bytes:file.size});
  await db.update(generationJobs).set({input:{imageUrl:stored.url,objectKey:key,systemPrompt,taxonomySnapshot:taxonomy.snapshot,taxonomySnapshotHash:taxonomy.hash}}).where(eq(generationJobs.id,row.id));
  try{await enqueueGenerationJob(row.id);}catch(e){await db.update(generationJobs).set({status:'failed',errorMessage:e instanceof Error?e.message:'Queue unavailable',finishedAt:new Date()}).where(eq(generationJobs.id,row.id));return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);}
  return ok(c,{jobId:row.id,status:'queued'},202);
});
jobRoutes.get('/:id',async(c)=>{
  const [row]=await getDb().select().from(generationJobs).where(eq(generationJobs.id,c.req.param('id'))).limit(1);
  return row?ok(c,row):fail(c,'NOT_FOUND','Job not found',404);
});
jobRoutes.post('/:id/retry',async(c)=>{
  const id=c.req.param('id'); const [row]=await getDb().select().from(generationJobs).where(eq(generationJobs.id,id)).limit(1);
  if(!row)return fail(c,'NOT_FOUND','Job not found',404);
  if(!['failed','cancelled'].includes(row.status))return fail(c,'NOT_RETRYABLE','Only failed or cancelled jobs can be retried',409);
  if (row.errorDetails && typeof row.errorDetails === 'object' && (row.errorDetails as {retryable?:unknown}).retryable === false) {
    return fail(c, 'NOT_RETRYABLE', '该错误无法通过重复相同请求恢复，请调整模型或输入后创建新任务', 409);
  }
  if (row.modelId) {
    const [model] = await getDb().select({ id: providerModels.id, enabled: providerModels.enabled })
      .from(providerModels).where(eq(providerModels.id, row.modelId)).limit(1);
    if (!model) return fail(c, 'MODEL_DELETED', '原任务使用的模型已永久删除，请创建新任务并选择可用模型', 409);
    if (!model.enabled) return fail(c, 'MODEL_ARCHIVED', '原任务使用的模型已归档，请恢复模型或创建新任务', 409);
  }
  if (row.visionModelId) {
    const [model] = await getDb().select({ id: providerModels.id, enabled: providerModels.enabled })
      .from(providerModels).where(eq(providerModels.id, row.visionModelId)).limit(1);
    if (!model) return fail(c, 'MODEL_DELETED', '原任务使用的视觉模型已永久删除，请创建新任务并选择可用模型', 409);
    if (!model.enabled) return fail(c, 'MODEL_ARCHIVED', '原任务使用的视觉模型已归档，请恢复模型或创建新任务', 409);
  }
  try {
    await clearTerminalQueueJobForRetry(getJobQueue(), row.bullJobId ?? id);
  } catch (error) {
    if (error instanceof QueueJobStillRunningError) {
      return fail(c, 'QUEUE_JOB_STILL_RUNNING', error.message, 409);
    }
    return fail(c, 'QUEUE_UNAVAILABLE', 'Redis queue is unavailable', 503);
  }
  await getDb().update(generationJobs).set({status:'pending',errorMessage:null,errorCode:null,errorDetails:null,progress:{stage:'queued',percent:0,message:'等待处理',updatedAt:new Date().toISOString()},startedAt:null,finishedAt:null}).where(eq(generationJobs.id,id));
  try{await enqueueGenerationJob(id, retryEnqueueOptions(row.type));}catch(e){
    await getDb().update(generationJobs).set({status:'failed',errorMessage:e instanceof Error?e.message:'Queue unavailable',finishedAt:new Date()}).where(eq(generationJobs.id,id));
    return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);
  }
  return ok(c,{jobId:id,status:'queued'},202);
});

jobRoutes.post('/:id/set-cover',async(c)=>{
  const body=await c.req.json().catch(()=>({})); const templateId=typeof body.templateId==='string'?body.templateId:''; const imageIndex=Number(body.imageIndex??0);
  const db=getDb(); const [[job],[template]]=await Promise.all([
    db.select().from(generationJobs).where(and(eq(generationJobs.id,c.req.param('id')),eq(generationJobs.status,'succeeded'))).limit(1),
    db.select().from(promptTemplates).where(eq(promptTemplates.id,templateId)).limit(1),
  ]);
  if(!job)return fail(c,'JOB_NOT_READY','Generation job is not ready',409); if(!template)return fail(c,'NOT_FOUND','Template not found',404);
  const images=(job.output as {images?:Array<{url?:string;b64_json?:string}>}|null)?.images??[]; const image=images[imageIndex];
  if(!image)return fail(c,'IMAGE_NOT_FOUND','Generated image not found',404);
  let bytes:Buffer;
  if(image.b64_json)bytes=Buffer.from(image.b64_json,'base64');
  else {if(!image.url)return fail(c,'IMAGE_URL_MISSING','Generated image URL is missing',422);const response=await fetch(image.url);if(!response.ok)return fail(c,'GENERATED_IMAGE_UNAVAILABLE',`Generated image cannot be downloaded (${response.status})`,502);bytes=Buffer.from(await response.arrayBuffer())}
  const key=`public/templates/${template.id}/cover-${job.id}.png`; const stored=await putObject(key,bytes,'image/png');
  await db.insert(mediaObjects).values({objectKey:key,bucket:storageKind(),url:stored.url,storageClass:'permanent',prefixKind:'template',ownerType:'template',ownerId:template.id,mime:'image/png',bytes:bytes.length}).onConflictDoUpdate({target:mediaObjects.objectKey,set:{url:stored.url,bytes:bytes.length,deletedAt:null}});
  const [updated]=await db.update(promptTemplates).set({coverObjectKey:key,coverUrl:stored.url,updatedAt:new Date()}).where(eq(promptTemplates.id,template.id)).returning();
  if(template.coverObjectKey&&template.coverObjectKey!==key)await deleteObject(template.coverObjectKey);
  return ok(c,updated);
});
