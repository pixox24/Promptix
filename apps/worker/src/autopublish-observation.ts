import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db, templateGovernanceState } from './db.js';
import { redisConnection } from './env.js';

export type ObservationSignals = {
  coverAvailable: boolean;
  promptCompiles: boolean;
  taxonomyEnabled: boolean;
  duplicateSimilarity: number;
  generationAttempts: number;
  generationFailures: number;
  safetyRejected: boolean;
  batchFailureRate: number;
  observationExpired: boolean;
};

export function evaluateAutopublishObservation(signals: ObservationSignals) {
  if (signals.safetyRejected) return { action: 'archive' as const, reasonCode: 'SAFETY_REJECTED' };
  if (!signals.coverAvailable) return { action: 'archive' as const, reasonCode: 'COVER_MISSING' };
  if (!signals.promptCompiles) return { action: 'archive' as const, reasonCode: 'PROMPT_INVALID' };
  if (!signals.taxonomyEnabled) return { action: 'archive' as const, reasonCode: 'TAXONOMY_DISABLED' };
  const failureRate = signals.generationAttempts
    ? signals.generationFailures / signals.generationAttempts
    : 0;
  if (failureRate >= 0.4) return { action: 'limit_exposure' as const, reasonCode: 'GENERATION_FAILURE_RATE' };
  if (signals.duplicateSimilarity >= 0.82) return { action: 'limit_exposure' as const, reasonCode: 'NEAR_DUPLICATE' };
  if (signals.batchFailureRate >= 0.25) return { action: 'limit_exposure' as const, reasonCode: 'BATCH_FAILURE_RATE' };
  return signals.observationExpired
    ? { action: 'stabilize' as const }
    : { action: 'continue_observing' as const };
}

let queue: Queue | null = null;
function observationQueue() {
  if (!queue) queue = new Queue('promptix-jobs', { connection: redisConnection() });
  return queue;
}

export async function enqueueDueObservations(now = new Date(), limit = 50) {
  const leaseUntil = new Date(now.getTime() + 60_000);
  const rows = await db.transaction(async (tx) => {
    const due = await tx.select().from(templateGovernanceState).where(and(
      eq(templateGovernanceState.lifecycleState, 'published_observing'),
      lte(templateGovernanceState.observationUntil, now),
      or(isNull(templateGovernanceState.leaseUntil), lte(templateGovernanceState.leaseUntil, now)),
    )).limit(limit).for('update', { skipLocked: true });
    for (const row of due) {
      await tx.update(templateGovernanceState).set({
        leaseToken: randomUUID(), leaseUntil, updatedAt: now,
      }).where(eq(templateGovernanceState.templateId, row.templateId));
    }
    return due;
  });
  for (const row of rows) {
    await observationQueue().add('autopublish-observation', {
      kind: 'autopublish_observation', templateId: row.templateId,
    }, { jobId: `autopublish-observation:${row.templateId}:${row.observationUntil?.getTime() ?? 0}` });
  }
  return rows.length;
}
