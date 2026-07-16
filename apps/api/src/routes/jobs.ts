import { Hono, type Context } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { jobTypeSchema, type JobType } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { generationJobs, mediaObjects, providerModels, providers, promptTemplates } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';
import { getJobQueue, QUEUE_NAME } from '../lib/queue.js';
import { loadEnv } from '../config/env.js';
import { putObject, storageKind } from '../lib/storage.js';

const jobInput = z.object({
  type: jobTypeSchema,
  input: z.record(z.unknown()).default({}),
  modelId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  templateId: z.string().optional(),
});

async function enqueue(jobId:string) {
  const q=await getJobQueue().add('execute',{jobId},{jobId,attempts:loadEnv().JOB_ATTEMPTS,backoff:{type:'exponential',delay:1000},removeOnComplete:100,removeOnFail:500});
  await getDb().update(generationJobs).set({status:'queued',queueName:QUEUE_NAME,bullJobId:q.id}).where(eq(generationJobs.id,jobId));
}

async function validatedModel(jobType: JobType, modelId?: string, legacyProviderId?: string) {
  if (!modelId) return { modelId: undefined, providerId: legacyProviderId };
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
  const capabilities = new Set(row.model.capabilities);
  if (jobType === 'image_generate' && !capabilities.has('image')) {
    throw new Error('MODEL_CAPABILITY_MISMATCH');
  }
  if (['text_expand', 'structure', 'image_reverse'].includes(jobType) &&
      (!capabilities.has('text') || !capabilities.has('structured_output'))) {
    throw new Error('MODEL_CAPABILITY_MISMATCH');
  }
  return { modelId: row.model.id, providerId: row.model.providerId };
}

function modelValidationFailure(c: Context, error: unknown) {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'MODEL_NOT_FOUND':
      return fail(c, code, 'Model not found', 404);
    case 'MODEL_DISABLED':
      return fail(c, code, 'Model or provider is disabled', 409);
    case 'MODEL_PROVIDER_MISMATCH':
      return fail(c, code, 'modelId and providerId refer to different providers', 409);
    case 'MODEL_CAPABILITY_MISMATCH':
      return fail(c, code, 'Model does not support this job type', 409);
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
  const [row]=await getDb().insert(generationJobs).values({
    type: parsed.data.type,
    input: parsed.data.input,
    templateId: parsed.data.templateId,
    modelId: selection.modelId,
    providerId: selection.providerId,
    status:'pending',
    actorId:admin.sub,
  }).returning();
  try { await enqueue(row.id); } catch(e) {
    await getDb().update(generationJobs).set({status:'failed',errorMessage:e instanceof Error?e.message:'Queue unavailable',finishedAt:new Date()}).where(eq(generationJobs.id,row.id));
    return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);
  }
  return ok(c,{jobId:row.id,status:'queued'},202);
});
jobRoutes.post('/image-reverse',async(c)=>{
  const body=await c.req.parseBody(); const file=body.file; const providerId=typeof body.providerId==='string'?body.providerId:undefined;
  const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
  if(!(file instanceof File)||!file.type.startsWith('image/')) return fail(c,'IMAGE_REQUIRED','An image file is required',400);
  if(file.size>10*1024*1024)return fail(c,'FILE_TOO_LARGE','Image must be at most 10MB',413);
  const admin=c.get('admin'); const db=getDb();
  let selection: { modelId?: string; providerId?: string };
  try {
    selection = await validatedModel('image_reverse', modelId, providerId);
  } catch (error) {
    return modelValidationFailure(c, error);
  }
  const [row]=await db.insert(generationJobs).values({
    type:'image_reverse',
    status:'pending',
    actorId:admin.sub,
    modelId: selection.modelId,
    providerId: selection.providerId,
    input:{},
  }).returning();
  const ext=file.type.split('/')[1]?.replace('jpeg','jpg')??'bin'; const key=`temp/inputs/${row.id}/source.${ext}`;
  const stored=await putObject(key,Buffer.from(await file.arrayBuffer()),file.type);
  await db.insert(mediaObjects).values({objectKey:key,bucket:storageKind(),url:stored.url,storageClass:'temp',prefixKind:'input',expiresAt:new Date(Date.now()+7*86400000),jobId:row.id,mime:file.type,bytes:file.size});
  await db.update(generationJobs).set({input:{imageUrl:stored.url,objectKey:key}}).where(eq(generationJobs.id,row.id));
  try{await enqueue(row.id);}catch(e){await db.update(generationJobs).set({status:'failed',errorMessage:e instanceof Error?e.message:'Queue unavailable',finishedAt:new Date()}).where(eq(generationJobs.id,row.id));return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);}
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
  await getDb().update(generationJobs).set({status:'pending',errorMessage:null,startedAt:null,finishedAt:null}).where(eq(generationJobs.id,id));
  try{await enqueue(id);}catch{return fail(c,'QUEUE_UNAVAILABLE','Redis queue is unavailable',503);}
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
  const bytes=image.b64_json?Buffer.from(image.b64_json,'base64'):Buffer.from(await (await fetch(image.url!)).arrayBuffer());
  const key=`public/templates/${template.id}/cover.png`; const stored=await putObject(key,bytes,'image/png');
  await db.insert(mediaObjects).values({objectKey:key,bucket:storageKind(),url:stored.url,storageClass:'permanent',prefixKind:'template',ownerType:'template',ownerId:template.id,mime:'image/png',bytes:bytes.length}).onConflictDoUpdate({target:mediaObjects.objectKey,set:{url:stored.url,bytes:bytes.length,deletedAt:null}});
  const [updated]=await db.update(promptTemplates).set({coverObjectKey:key,coverUrl:stored.url,updatedAt:new Date()}).where(eq(promptTemplates.id,template.id)).returning();
  return ok(c,updated);
});
