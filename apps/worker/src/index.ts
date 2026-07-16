import { Worker, type Job } from 'bullmq';
import { and, desc, eq, or } from 'drizzle-orm';
import { loadEnvFile, redisConnection } from './env.js';
loadEnvFile();
const { db, generationJobs, providers } = await import('./db.js');
const { describeImage, generateImage, structurePrompt } = await import('./adapters.js');

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
      const [provider]=record.providerId
        ?await db.select().from(providers).where(and(eq(providers.id,record.providerId),eq(providers.enabled,true))).limit(1)
        :await db.select().from(providers).where(and(eq(providers.enabled,true),or(eq(providers.kind,record.type==='image_generate'?'image':'llm'),eq(providers.kind,'both')))).orderBy(desc(providers.isDefault)).limit(1);
      if(!provider)throw new Error('No enabled provider configured for this job');
      if(record.type==='image_generate'){
        output=await generateImage(provider,record.input as Record<string,unknown>);
      }else if(record.type==='image_reverse'&&provider.protocol==='deepseek_chat'){
        const allProviders=await db.select().from(providers).where(eq(providers.enabled,true));
        const visionProvider=allProviders.find(candidate=>candidate.protocol==='openai_chat'&&Boolean((candidate.defaults as {supportsVision?:boolean}|null)?.supportsVision));
        if(!visionProvider)throw new Error('DeepSeek image reverse requires an enabled OpenAI Chat provider marked as vision-capable');
        const imageUrl=(record.input as {imageUrl?:unknown}).imageUrl;
        if(typeof imageUrl!=='string')throw new Error('image_reverse job is missing input.imageUrl');
        const description=await describeImage(visionProvider,imageUrl);
        output=await structurePrompt(provider,{text:`以下是视觉模型对参考图的详细描述。请保留视觉事实并优化为可复用模板：\n${description}`});
      }else{
        output=await structurePrompt(provider,record.input as Record<string,unknown>);
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
