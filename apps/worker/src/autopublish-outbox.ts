import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { and, asc, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { db, templateAutopublishOutbox } from './db.js';
import { redisConnection } from './env.js';

const QUEUE_NAME = 'promptix-jobs';
const OUTBOX_LEASE_MS = 60_000;

export type ClaimedAutopublishOutbox = {
  id: string;
  runId: string;
  leaseToken?: string;
};

export type AutopublishOutboxDependencies = {
  claim(): Promise<ClaimedAutopublishOutbox | null>;
  enqueue(row: ClaimedAutopublishOutbox): Promise<void>;
  markDispatched(row: ClaimedAutopublishOutbox): Promise<void>;
  release(row: ClaimedAutopublishOutbox): Promise<void>;
};

let queue: Queue | null = null;
function jobQueue() {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}

async function claim(): Promise<ClaimedAutopublishOutbox | null> {
  const now = new Date();
  const leaseToken = randomUUID();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(templateAutopublishOutbox).where(and(
      isNull(templateAutopublishOutbox.dispatchedAt),
      lte(templateAutopublishOutbox.availableAt, now),
      or(
        isNull(templateAutopublishOutbox.leasedUntil),
        lt(templateAutopublishOutbox.leasedUntil, now),
      ),
    )).orderBy(asc(templateAutopublishOutbox.availableAt))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!row) return null;
    const [claimed] = await tx.update(templateAutopublishOutbox).set({
      leaseToken,
      leasedUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
    }).where(and(
      eq(templateAutopublishOutbox.id, row.id),
      isNull(templateAutopublishOutbox.dispatchedAt),
    )).returning();
    return claimed ? { id: claimed.id, runId: claimed.runId, leaseToken } : null;
  });
}

async function enqueue(row: ClaimedAutopublishOutbox) {
  await jobQueue().add('autopublish', {
    kind: 'autopublish_run',
    runId: row.runId,
  }, {
    jobId: row.id,
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

async function markDispatched(row: ClaimedAutopublishOutbox) {
  await db.update(templateAutopublishOutbox).set({
    dispatchedAt: new Date(),
    leaseToken: null,
    leasedUntil: null,
  }).where(and(
    eq(templateAutopublishOutbox.id, row.id),
    eq(templateAutopublishOutbox.leaseToken, row.leaseToken ?? ''),
  ));
}

async function release(row: ClaimedAutopublishOutbox) {
  await db.update(templateAutopublishOutbox).set({
    leaseToken: null,
    leasedUntil: null,
  }).where(and(
    eq(templateAutopublishOutbox.id, row.id),
    eq(templateAutopublishOutbox.leaseToken, row.leaseToken ?? ''),
  ));
}

const productionDependencies: AutopublishOutboxDependencies = {
  claim,
  enqueue,
  markDispatched,
  release,
};

export async function dispatchAutopublishOutbox(
  dependencies: AutopublishOutboxDependencies = productionDependencies,
) {
  const row = await dependencies.claim();
  if (!row) return false;
  try {
    await dependencies.enqueue(row);
    await dependencies.markDispatched(row);
    return true;
  } catch (error) {
    await dependencies.release(row);
    throw error;
  }
}
