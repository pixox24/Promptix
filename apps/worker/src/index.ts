import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { governanceRuleSetSchema, jobTypeSchema } from '@promptix/shared';
import { loadEnvFile, redisConnection } from './env.js';
import { effectiveIngestJobInput } from './ingest-job-input.js';
loadEnvFile();
const { db, generationJobs, agentRuns, governanceRuleSets } = await import('./db.js');
const { generateImage, structurePromptDetailed } = await import('./adapters.js');
const { generateGovernanceProposals } = await import('./ai-adapters.js');
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
const { persistGovernancePlan } = await import('./governance-plan-persistence.js');
const { executeGovernanceJob, rollbackGovernanceJob } = await import('./governance-job-execution.js');
const { buildScheduledGovernanceInput, releaseScheduledGovernanceLease } = await import('./scheduled-governance.js');
const { advanceAutopublishRun } = await import('./autopublish-orchestrator.js');
const { dispatchAutopublishOutbox } = await import('./autopublish-outbox.js');
const { runAutopublishModelJob } = await import('./autopublish-model-jobs.js');

const QUEUE_NAME='promptix-jobs';
type WorkerPayload =
  | { jobId: string }
  | { kind: 'governance_schedule'; ruleSetId: string; ruleSetVersion: number }
  | { kind: 'autopublish_run'; runId: string };
const worker=new Worker(QUEUE_NAME,async(job:Job<WorkerPayload>)=>{
  if ('kind' in job.data && job.data.kind === 'autopublish_run') {
    return advanceAutopublishRun(job.data.runId);
  }
  if (!('jobId' in job.data)) {
    const [rules] = await db.select().from(governanceRuleSets).where(eq(governanceRuleSets.id, job.data.ruleSetId)).limit(1);
    if (!rules || !rules.enabled || rules.version !== job.data.ruleSetVersion) return { skipped: true, reason: 'RULE_SET_CHANGED' };
    const parsedRules = governanceRuleSetSchema.parse(rules.rules);
    const [run] = await db.insert(agentRuns).values({ trigger: 'scheduled', goal: '定时模板治理巡检', scope: { mode: 'query', query: { scenarios: [], styles: [], subjects: [], sort: 'updated_desc' }, exclusions: [], snapshotAt: new Date().toISOString(), schedulerJobId: job.id }, promptVersion: parsedRules.agent.promptVersion, ruleSetId: rules.id, ruleSetVersion: rules.version, status: 'queued' }).returning();
    try {
      const model = await resolvePrimaryModel('template_governance_plan', parsedRules.agent.modelId, null);
      await db.update(agentRuns).set({ status: 'analyzing', modelId: model.model.id, startedAt: new Date(), progress: { phase: 'analyzing', percent: 20 } }).where(eq(agentRuns.id, run.id));
      const input = await buildScheduledGovernanceInput(rules.rules, run.id);
      const proposals = await generateGovernanceProposals(model, input);
      const persisted = await persistGovernancePlan(run.id, proposals);
       const execution = persisted.automaticChangeSetId ? await executeGovernanceJob(persisted.automaticChangeSetId) : null;
      await releaseScheduledGovernanceLease(run.id);
      return { runId: run.id, status: execution?.status ?? 'planned', persisted, execution };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(agentRuns).set({ status: 'failed', errorCode: 'GOVERNANCE_PLAN_FAILED', errorMessage: message, finishedAt: new Date(), progress: { phase: 'failed', percent: 100 } }).where(eq(agentRuns.id, run.id));
      await releaseScheduledGovernanceLease(run.id);
      throw error;
    }
  }
  const jobId = job.data.jobId;
  const [record]=await db.select().from(generationJobs).where(eq(generationJobs.id,jobId)).limit(1);
  if(!record)throw new Error(`Job ${jobId} not found`);
  await db.update(generationJobs).set({status:'running',attempts:record.attempts+1,startedAt:new Date(),finishedAt:null,errorMessage:null,errorCode:null,errorDetails:null}).where(eq(generationJobs.id,record.id));
  try{
    let output:unknown;
    if(record.type==='noop'){
      if((record.input as {fail?:boolean}).fail)throw new Error('Intentional noop failure');
      output={ok:true,processedAt:new Date().toISOString(),operation:record.type};
    } else if (record.type === 'template_governance_apply' || record.type === 'template_governance_rollback') {
      const targetId = (record.input as { targetId?: unknown }).targetId;
      if (typeof targetId !== 'string') throw new Error('Governance execution job is missing targetId');
      output = record.type === 'template_governance_apply' ? await executeGovernanceJob(targetId) : await rollbackGovernanceJob(targetId);
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
      } else if (jobType === 'template_governance_plan') {
        const proposals = await generateGovernanceProposals(primary, record.input as Record<string, unknown>);
        const targetId = (record.input as { targetId?: unknown }).targetId;
        if (typeof targetId !== 'string') throw new Error('Governance plan job is missing targetId');
        const persisted = await persistGovernancePlan(targetId, proposals);
        const execution = persisted.automaticChangeSetId ? await executeGovernanceJob(persisted.automaticChangeSetId) : null;
        output = { proposals, persisted, execution };
      } else if (
        jobType === 'template_autopublish_repair'
        || jobType === 'template_autopublish_screen'
        || jobType === 'template_autopublish_quality'
        || jobType === 'template_autopublish_counter_review'
      ) {
        output = await runAutopublishModelJob(jobType, primary, record.input as Record<string, unknown>);
      } else if (jobType === 'image_generate') {
        output = await generateImage(primary, record.input as Record<string, unknown>);
        output = await persistGeneratedOutput(
          record.id,
          record.templateId,
          output,
          record.input as Record<string, unknown>,
        );
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
    if (record.type === 'template_governance_plan') {
      const targetId = (record.input as { targetId?: unknown }).targetId;
      if (typeof targetId === 'string') await db.update(agentRuns).set({ status: 'failed', errorCode: pipelineError?.details.code ?? 'GOVERNANCE_PLAN_FAILED', errorMessage: message, progress: { phase: 'failed', percent: 100 }, finishedAt: new Date() }).where(eq(agentRuns.id, targetId));
    }
    console.error(JSON.stringify({level:'error',event:'job_failed',jobId:record.id,type:record.type,error:message}));
    if (pipelineError && !pipelineError.details.retryable) throw new UnrecoverableError(message);
    throw error;
  }
},{connection:redisConnection(),concurrency:Number(process.env.WORKER_CONCURRENCY??2)});

worker.on('ready',()=>console.log(JSON.stringify({level:'info',event:'worker_ready',queue:QUEUE_NAME})));
worker.on('error',(error)=>console.error(JSON.stringify({level:'error',event:'worker_error',error:error.message})));

const outboxTimer = setInterval(() => {
  void dispatchAutopublishOutbox().catch((error) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'autopublish_outbox_dispatch_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
  });
}, 1_000);
outboxTimer.unref();

async function shutdown(){clearInterval(outboxTimer);await worker.close();process.exit(0);}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
