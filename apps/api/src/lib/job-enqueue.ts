import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { generationJobs } from '../db/schema.js';
import { loadEnv } from '../config/env.js';
import { getJobQueue, QUEUE_NAME } from './queue.js';

export function retryEnqueueOptions(jobType: string): { attempts?: number } {
  return jobType === 'provider_test' ? { attempts: 1 } : {};
}

export async function enqueueGenerationJob(
  jobId: string,
  options: { attempts?: number } = {},
): Promise<void> {
  await getDb().update(generationJobs).set({
    status: 'queued',
    queueName: QUEUE_NAME,
    bullJobId: jobId,
  }).where(eq(generationJobs.id, jobId));
  await getJobQueue().add('execute', { jobId }, {
    jobId,
    attempts: options.attempts ?? loadEnv().JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function enqueueAutopublishRun(runId: string): Promise<void> {
  await getJobQueue().add('autopublish', { runId }, {
    jobId: `autopublish:${runId}`,
    attempts: loadEnv().JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
