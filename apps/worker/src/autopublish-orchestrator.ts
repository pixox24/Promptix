import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  db,
  governanceAuditEvents,
  templateAutopublishOutbox,
  templateAutopublishRuns,
  templateAutopublishStageAttempts,
} from './db.js';
import {
  nextAutopublishStage,
  type AutopublishCommand,
  type AutopublishSnapshot,
} from './autopublish-stages.js';

const LEASE_MS = 60_000;
const TERMINAL_OR_PAUSED = [
  'conflict_waiting', 'needs_attention', 'duplicate_found',
  'rejected', 'succeeded', 'failed', 'cancelled',
];

type Lease = {
  token: string;
  snapshot: AutopublishSnapshot & { id: string; inputSnapshotHash: string };
};

export type AutopublishOrchestratorDependencies = {
  acquire(runId: string): Promise<Lease | null>;
  execute(runId: string, token: string, command: AutopublishCommand): Promise<void>;
  release(runId: string, token: string): Promise<void>;
};

async function acquire(runId: string): Promise<Lease | null> {
  const now = new Date();
  const token = randomUUID();
  const [run] = await db.update(templateAutopublishRuns).set({
    leaseToken: token,
    leaseUntil: new Date(now.getTime() + LEASE_MS),
    status: 'running',
    startedAt: sql`coalesce(${templateAutopublishRuns.startedAt}, ${now})`,
  }).where(and(
    eq(templateAutopublishRuns.id, runId),
    or(isNull(templateAutopublishRuns.leaseUntil), lt(templateAutopublishRuns.leaseUntil, now)),
    sql`${templateAutopublishRuns.status} not in (${sql.join(
      TERMINAL_OR_PAUSED.map((status) => sql`${status}`),
      sql`, `,
    )})`,
  )).returning();
  if (!run) return null;

  const attempts = await db.select().from(templateAutopublishStageAttempts)
    .where(eq(templateAutopublishStageAttempts.runId, runId))
    .orderBy(desc(templateAutopublishStageAttempts.attempt));
  const done = (stage: string) => attempts.some(
    (attempt) => attempt.stage === stage && attempt.status === 'succeeded',
  );
  return {
    token,
    snapshot: {
      id: run.id,
      status: run.status,
      currentStage: run.currentStage,
      inputSnapshotHash: run.inputSnapshotHash,
      draftJobDone: done('generating_draft'),
      repairJobDone: done('repairing'),
      coverJobDone: done('generating_cover'),
      publishDone: done('publishing'),
    },
  };
}

async function execute(runId: string, token: string, command: AutopublishCommand) {
  if (command.kind === 'stop' || command.kind === 'wait') return;
  await db.transaction(async (tx) => {
    const [run] = await tx.select().from(templateAutopublishRuns).where(and(
      eq(templateAutopublishRuns.id, runId),
      eq(templateAutopublishRuns.leaseToken, token),
    )).limit(1);
    if (!run) return;

    const stage = command.nextStage ?? run.currentStage;
    const [active] = await tx.select().from(templateAutopublishStageAttempts).where(and(
      eq(templateAutopublishStageAttempts.runId, runId),
      eq(templateAutopublishStageAttempts.stage, stage),
      inArray(templateAutopublishStageAttempts.status, ['queued', 'running']),
    )).limit(1);
    if (active) return;

    const [latest] = await tx.select({
      attempt: templateAutopublishStageAttempts.attempt,
    }).from(templateAutopublishStageAttempts).where(and(
      eq(templateAutopublishStageAttempts.runId, runId),
      eq(templateAutopublishStageAttempts.stage, stage),
    )).orderBy(desc(templateAutopublishStageAttempts.attempt)).limit(1);
    const attempt = (latest?.attempt ?? 0) + 1;
    await tx.insert(templateAutopublishStageAttempts).values({
      runId,
      stage,
      attempt,
      status: 'queued',
      inputHash: run.inputSnapshotHash,
      usage: {},
    });
    await tx.update(templateAutopublishRuns).set({
      status: command.kind === 'complete' ? 'succeeded' : 'running',
      currentStage: stage,
      ...(command.kind === 'complete' ? { finishedAt: new Date() } : {}),
    }).where(and(
      eq(templateAutopublishRuns.id, runId),
      eq(templateAutopublishRuns.leaseToken, token),
    ));
    await tx.insert(governanceAuditEvents).values({
      actorType: 'agent',
      actorId: null,
      eventType: 'autopublish.stage_queued',
      targetType: 'autopublish_run',
      targetId: runId,
      payload: { command: command.kind, stage, attempt },
    });
    await tx.insert(templateAutopublishOutbox).values({
      runId,
      eventType: 'autopublish.run.advance',
      dedupeKey: `run:${runId}:stage:${stage}:attempt:${attempt}`,
      payload: { runId, stage, attempt },
    }).onConflictDoNothing();
  });
}

async function release(runId: string, token: string) {
  await db.update(templateAutopublishRuns).set({
    leaseToken: null,
    leaseUntil: null,
  }).where(and(
    eq(templateAutopublishRuns.id, runId),
    eq(templateAutopublishRuns.leaseToken, token),
  ));
}

const productionDependencies: AutopublishOrchestratorDependencies = {
  acquire,
  execute,
  release,
};

export async function advanceAutopublishRun(
  runId: string,
  dependencies: AutopublishOrchestratorDependencies = productionDependencies,
) {
  const lease = await dependencies.acquire(runId);
  if (!lease) return { kind: 'stop' as const };
  try {
    const command = nextAutopublishStage(lease.snapshot);
    await dependencies.execute(runId, lease.token, command);
    return command;
  } finally {
    await dependencies.release(runId, lease.token);
  }
}
