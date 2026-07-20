import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { jobTypeSchema } from '@promptix/shared';
import { loadEnvFile, redisConnection } from './env.js';
import { effectiveIngestJobInput } from './ingest-job-input.js';
loadEnvFile();
const { db, generationJobs } = await import('./db.js');
const { generateImage, structurePromptDetailed } = await import('./adapters.js');
const { runProviderTextTest } = await import('./provider-text-test.js');
const {
  resolvePrimaryModel,
  resolveImageReverseModels,
} = await import('./model-resolver.js');
const {
  assertCapabilitiesForJob,
} = await import('./model-routing.js');
const { persistGeneratedOutput } = await import('./generated-media.js');
const { runImageReversePipeline } = await import('./image-reverse-pipeline.js');
const { IngestPipelineError } = await import('./job-errors.js');

const QUEUE_NAME='promptix-jobs';
const worker=new Worker(QUEUE_NAME,async(job:Job<{jobId:string}>)=>{
  const [record]=await db.select().from(generationJobs).where(eq(generationJobs.id,job.data.jobId)).limit(1);
  if(!record)throw new Error(`Job ${job.data.jobId} not found`);
  await db.update(generationJobs).set({status:'running',attempts:record.attempts+1,startedAt:new Date(),finishedAt:null,errorMessage:null,errorCode:null,errorDetails:null}).where(eq(generationJobs.id,record.id));
  try{
    let output:unknown;
    if(record.type==='noop'){
      if((record.input as {fail?:boolean}).fail)throw new Error('Intentional noop failure');
      output={ok:true,processedAt:new Date().toISOString()};
    }else{
      const jobType = jobTypeSchema.parse(record.type);
      const recordInput = effectiveIngestJobInput(jobType, record.input as Record<string, unknown>);
      const primary = await resolvePrimaryModel(
        jobType,
        record.modelId,
        record.providerId,
      );
      assertCapabilitiesForJob(primary.model, jobType);

      if (record.modelId !== primary.model.id || record.providerId !== primary.provider.id) {
        await db.update(generationJobs).set({
          modelId: primary.model.id,
          providerId: primary.provider.id,
        }).where(eq(generationJobs.id, record.id));
      }

      if (jobType === 'provider_test') {
        output = await runProviderTextTest(primary);
      } else if (jobType === 'image_generate') {
        output = await generateImage(primary, record.input as Record<string, unknown>);
        output = await persistGeneratedOutput(record.id, record.templateId, output);
      } else if (jobType === 'image_reverse') {
        const imageUrl = (record.input as { imageUrl?: unknown }).imageUrl;
        if (typeof imageUrl !== 'string') {
          throw new Error('image_reverse job is missing input.imageUrl');
        }
        const imageReverseModels = await resolveImageReverseModels({ structureModelId: record.modelId, structureProviderId: record.providerId, visionModelId: record.visionModelId });
        const pipeline = await runImageReversePipeline({
          imageUrl,
          systemPrompt: String(recordInput.systemPrompt),
          taxonomySnapshot: recordInput.taxonomySnapshot,
          taxonomySnapshotHash: typeof recordInput.taxonomySnapshotHash === 'string' ? recordInput.taxonomySnapshotHash : undefined,
          vision: imageReverseModels.vision,
          structure: imageReverseModels.structure,
          onProgress: async(progress) => { await db.update(generationJobs).set({progress}).where(eq(generationJobs.id,record.id)); },
        });
        output = pipeline.draft;
        await db.update(generationJobs).set({resultMeta:pipeline.resultMeta}).where(eq(generationJobs.id,record.id));
      } else {
        const structured = await structurePromptDetailed(primary, recordInput);
        output = structured.draft;
        await db.update(generationJobs).set({ resultMeta: {
          repaired: structured.repaired,
          qualityIssues: [],
          visionModelId: primary.model.id,
          structureModelId: primary.model.id,
          taxonomySnapshotHash: typeof recordInput.taxonomySnapshotHash === 'string' ? recordInput.taxonomySnapshotHash : undefined,
          classificationWarnings: structured.classificationWarnings,
        } }).where(eq(generationJobs.id, record.id));
      }
    }
    await db.update(generationJobs).set({status:'succeeded',output,finishedAt:new Date(),errorMessage:null,errorCode:null,errorDetails:null}).where(eq(generationJobs.id,record.id));
    console.log(JSON.stringify({level:'info',event:'job_succeeded',jobId:record.id,type:record.type}));
    return output;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    const pipelineError = error instanceof IngestPipelineError ? error : null;
    await db.update(generationJobs).set({status:'failed',errorMessage:message,errorCode:pipelineError?.details.code,errorDetails:pipelineError?.details,finishedAt:new Date()}).where(eq(generationJobs.id,record.id));
    console.error(JSON.stringify({level:'error',event:'job_failed',jobId:record.id,type:record.type,error:message}));
    if (pipelineError && !pipelineError.details.retryable) throw new UnrecoverableError(message);
    throw error;
  }
},{connection:redisConnection(),concurrency:Number(process.env.WORKER_CONCURRENCY??2)});

worker.on('ready',()=>console.log(JSON.stringify({level:'info',event:'worker_ready',queue:QUEUE_NAME})));
worker.on('error',(error)=>console.error(JSON.stringify({level:'error',event:'worker_error',error:error.message})));

async function shutdown(){await worker.close();process.exit(0);}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
