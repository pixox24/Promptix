import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { jobTypeSchema } from '@promptix/shared';
import { loadEnvFile, redisConnection } from './env.js';
loadEnvFile();
const { db, generationJobs } = await import('./db.js');
const { describeImage, generateImage, structurePrompt } = await import('./adapters.js');
const { runProviderTextTest } = await import('./provider-text-test.js');
const {
  resolveDefaultVisionModel,
  resolvePrimaryModel,
} = await import('./model-resolver.js');
const {
  assertCapabilitiesForJob,
  imageReverseNeedsVisionFallback,
} = await import('./model-routing.js');

const QUEUE_NAME='promptix-jobs';
const worker=new Worker(QUEUE_NAME,async(job:Job<{jobId:string}>)=>{
  const [record]=await db.select().from(generationJobs).where(eq(generationJobs.id,job.data.jobId)).limit(1);
  if(!record)throw new Error(`Job ${job.data.jobId} not found`);
  await db.update(generationJobs).set({status:'running',attempts:record.attempts+1,startedAt:new Date(),finishedAt:null,errorMessage:null}).where(eq(generationJobs.id,record.id));
  try{
    let output:unknown;
    if(record.type==='noop'){
      if((record.input as {fail?:boolean}).fail)throw new Error('Intentional noop failure');
      output={ok:true,processedAt:new Date().toISOString()};
    }else{
      const jobType = jobTypeSchema.parse(record.type);
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
      } else if (jobType === 'image_reverse') {
        const imageUrl = (record.input as { imageUrl?: unknown }).imageUrl;
        if (typeof imageUrl !== 'string') {
          throw new Error('image_reverse job is missing input.imageUrl');
        }
        if (imageReverseNeedsVisionFallback(primary.model)) {
          const vision = await resolveDefaultVisionModel();
          const description = await describeImage(vision, imageUrl);
          output = await structurePrompt(primary, {
            text: `以下是视觉模型对参考图的详细描述。请保留视觉事实并优化为可复用模板：\n${description}`,
          });
        } else {
          output = await structurePrompt(primary, { imageUrl });
        }
      } else {
        output = await structurePrompt(primary, record.input as Record<string, unknown>);
      }
    }
    await db.update(generationJobs).set({status:'succeeded',output,finishedAt:new Date(),errorMessage:null}).where(eq(generationJobs.id,record.id));
    console.log(JSON.stringify({level:'info',event:'job_succeeded',jobId:record.id,type:record.type}));
    return output;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await db.update(generationJobs).set({status:'failed',errorMessage:message,finishedAt:new Date()}).where(eq(generationJobs.id,record.id));
    console.error(JSON.stringify({level:'error',event:'job_failed',jobId:record.id,type:record.type,error:message}));
    throw error;
  }
},{connection:redisConnection(),concurrency:Number(process.env.WORKER_CONCURRENCY??2)});

worker.on('ready',()=>console.log(JSON.stringify({level:'info',event:'worker_ready',queue:QUEUE_NAME})));
worker.on('error',(error)=>console.error(JSON.stringify({level:'error',event:'worker_error',error:error.message})));

async function shutdown(){await worker.close();process.exit(0);}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
