import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  autopublishBudgetConsumedSchema,
  autopublishBudgetSchema,
  type AutopublishRecoveryAction,
  type AutopublishRun,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import {
  agentCapabilityGrants,
  governanceAuditEvents,
  governanceChangeSets,
  governanceExecutionPermits,
  templateAutopublishArtifacts,
  templateAutopublishOutbox,
  templateAutopublishRuns,
  templateAutopublishStageAttempts,
  templateGovernanceState,
} from '../db/schema.js';
import type { CapabilityGrant } from './autopublish-capabilities.js';
import {
  AutopublishServiceError,
  type AutopublishAdminActor,
  type AutopublishArtifactView,
  type AutopublishCreateRecord,
  type AutopublishRunView,
  type AutopublishServiceRepository,
  type AutopublishStageAttemptView,
  type StoredAutopublishRun,
} from './autopublish-service.js';

type RunRow = typeof templateAutopublishRuns.$inferSelect;
type PermitRow = typeof governanceExecutionPermits.$inferSelect;
type ChangeSetRow = typeof governanceChangeSets.$inferSelect;
type GovernanceStateRow = typeof templateGovernanceState.$inferSelect;
type AttemptRow = typeof templateAutopublishStageAttempts.$inferSelect;
type ArtifactRow = typeof templateAutopublishArtifacts.$inferSelect;

const TERMINAL_STATUSES = new Set(['duplicate_found', 'rejected', 'succeeded', 'failed', 'cancelled']);
const EXCEPTION_STATUSES = ['conflict_waiting', 'needs_attention', 'rejected', 'failed'] as const;
const TERMINAL_CHANGE_SET_STATUSES = new Set([
  'rejected',
  'partially_succeeded',
  'succeeded',
  'failed',
  'cancelled',
  'rollback_available',
  'rolled_back',
]);

const RECOVERY_STAGE: Omit<Record<AutopublishRecoveryAction, string>, 'retry_after_conflict'> = {
  edit_draft: 'validating',
  map_taxonomy: 'verifying_taxonomy',
  review_taxonomy: 'verifying_taxonomy',
  confirm_distinct: 'creating_template',
  retry_cover: 'generating_cover',
  retry_quality: 'reviewing_quality',
};

const RECOVERY_BY_ERROR: Record<string, AutopublishRecoveryAction[]> = {
  SCHEMA_INVALID: ['edit_draft'],
  TAXONOMY_INVALID: ['map_taxonomy', 'review_taxonomy'],
  TAXONOMY_UNRESOLVED: ['map_taxonomy', 'review_taxonomy'],
  TAXONOMY_LOW_CONFIDENCE: ['map_taxonomy', 'review_taxonomy'],
  NEAR_DUPLICATE: ['confirm_distinct'],
  COVER_REQUIRED: ['retry_cover'],
  QUALITY_THRESHOLD_NOT_MET: ['edit_draft', 'retry_quality'],
  VERSION_CONFLICT: ['retry_after_conflict'],
  RULE_CONFLICT: ['retry_after_conflict'],
  ACTIVE_GOVERNANCE_WORK_EXISTS: ['retry_after_conflict'],
};

export function recoveryStageFor(errorCode: string | null, action: AutopublishRecoveryAction) {
  if (action !== 'retry_after_conflict') return RECOVERY_STAGE[action];
  if (errorCode === 'ACTIVE_GOVERNANCE_WORK_EXISTS') return 'issuing_permit';
  if (errorCode === 'VERSION_CONFLICT') return 'validating';
  if (errorCode === 'RULE_CONFLICT') return 'reviewing_quality';
  throw new AutopublishServiceError('AUTOPUBLISH_ACTION_FORBIDDEN');
}

function allowedActions(row: RunRow, changeSet?: { status: string }): AutopublishRecoveryAction[] {
  if (!['conflict_waiting', 'needs_attention', 'failed'].includes(row.status)) return [];
  const actions = row.errorCode ? [...(RECOVERY_BY_ERROR[row.errorCode] ?? [])] : [];
  if (
    row.errorCode === 'ACTIVE_GOVERNANCE_WORK_EXISTS'
    && (!changeSet || !TERMINAL_CHANGE_SET_STATUSES.has(changeSet.status))
  ) return actions.filter((action) => action !== 'retry_after_conflict');
  return actions;
}

function toAttemptView(row: AttemptRow): AutopublishStageAttemptView {
  return {
    id: row.id,
    runId: row.runId,
    stage: row.stage,
    attempt: row.attempt,
    status: row.status,
    inputHash: row.inputHash,
    artifactId: row.artifactId,
    errorCode: row.errorCode,
  };
}

function toArtifactView(row: ArtifactRow): AutopublishArtifactView {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    schemaVersion: row.schemaVersion,
    contentHash: row.contentHash,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

function toStoredRun(
  row: RunRow,
  permit?: PermitRow,
  changeSet?: ChangeSetRow,
  governanceState?: GovernanceStateRow,
): StoredAutopublishRun {
  const budgetSnapshot = autopublishBudgetSchema.safeParse(row.budgetSnapshot);
  const budgetConsumed = autopublishBudgetConsumedSchema.safeParse(row.budgetConsumed);
  if (!budgetSnapshot.success || !budgetConsumed.success) {
    throw new AutopublishServiceError('AUTOPUBLISH_RUN_SNAPSHOT_INVALID');
  }
  const run = {
    id: row.id,
    status: row.status,
    currentStage: row.currentStage,
    triggerType: row.triggerType,
    requestedBy: row.requestedBy,
    agentId: row.agentId,
    capabilityGrantId: row.capabilityGrantId,
    flowType: row.flowType,
    sourceType: row.sourceType,
    sourceItemId: row.sourceItemId,
    inputSnapshotHash: row.inputSnapshotHash,
    ruleSetId: row.ruleSetId,
    ruleSetVersion: row.ruleSetVersion,
    taxonomySnapshotHash: row.taxonomySnapshotHash,
    promptVersion: row.promptVersion,
    budgetSnapshot: budgetSnapshot.data,
    budgetConsumed: budgetConsumed.data,
    repairCount: row.repairCount,
    templateId: row.templateId,
    permitId: permit?.id ?? null,
    changeSetId: row.changeSetId,
    errorCode: row.errorCode,
    errorDetails: row.errorDetails,
    nextAllowedActions: allowedActions(row, changeSet),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    observationUntil: governanceState?.observationUntil?.toISOString() ?? null,
    rollbackUntil: changeSet?.rollbackUntil?.toISOString() ?? null,
  } as AutopublishRun;
  return {
    ...run,
    inputSnapshot: row.inputSnapshot as StoredAutopublishRun['inputSnapshot'],
    idempotencyKey: row.idempotencyKey,
  };
}

async function loadViews(rows: RunRow[]): Promise<AutopublishRunView[]> {
  if (!rows.length) return [];
  const db = getDb();
  const runIds = rows.map((row) => row.id);
  const templateIds = rows.flatMap((row) => row.templateId ? [row.templateId] : []);
  const changeSetIds = rows.flatMap((row) => row.changeSetId ? [row.changeSetId] : []);
  const [attempts, artifacts, permits, states, changeSets] = await Promise.all([
    db.select().from(templateAutopublishStageAttempts)
      .where(inArray(templateAutopublishStageAttempts.runId, runIds))
      .orderBy(asc(templateAutopublishStageAttempts.stage), asc(templateAutopublishStageAttempts.attempt)),
    db.select().from(templateAutopublishArtifacts)
      .where(inArray(templateAutopublishArtifacts.runId, runIds))
      .orderBy(asc(templateAutopublishArtifacts.createdAt)),
    db.select().from(governanceExecutionPermits)
      .where(inArray(governanceExecutionPermits.autopublishRunId, runIds)),
    templateIds.length
      ? db.select().from(templateGovernanceState).where(inArray(templateGovernanceState.templateId, templateIds))
      : Promise.resolve([]),
    changeSetIds.length
      ? db.select().from(governanceChangeSets).where(inArray(governanceChangeSets.id, changeSetIds))
      : Promise.resolve([]),
  ]);
  const attemptViews = attempts.map(toAttemptView);
  const artifactViews = artifacts.map(toArtifactView);

  return rows.map((row) => {
    const stageAttempts = attemptViews.filter((attempt) => attempt.runId === row.id);
    const changeSet = changeSets.find((item) => item.id === row.changeSetId);
    const nextAllowedActions = allowedActions(row, changeSet);
    return {
      ...toStoredRun(
        row,
        permits.find((permit) => permit.autopublishRunId === row.id),
        changeSet,
        states.find((state) => state.templateId === row.templateId),
      ),
      nextAllowedActions,
      retryable: nextAllowedActions.length > 0,
      completedStages: [...new Set(
        stageAttempts
          .filter((attempt) => attempt.status === 'succeeded')
          .map((attempt) => attempt.stage),
      )],
      stageAttempts,
      artifacts: artifactViews.filter((artifact) => artifact.runId === row.id),
    };
  });
}

async function getView(id: string) {
  const [row] = await getDb().select().from(templateAutopublishRuns)
    .where(eq(templateAutopublishRuns.id, id)).limit(1);
  if (!row) return null;
  return (await loadViews([row]))[0] ?? null;
}

function assertIdempotency(existing: RunRow, input: Pick<AutopublishCreateRecord, 'inputSnapshotHash'>) {
  if (existing.inputSnapshotHash !== input.inputSnapshotHash) {
    throw new AutopublishServiceError('AUTOPUBLISH_IDEMPOTENCY_MISMATCH');
  }
}

export function createAutopublishRepository(): AutopublishServiceRepository {
  return {
    async findByIdempotencyKey(idempotencyKey) {
      const [row] = await getDb().select().from(templateAutopublishRuns)
        .where(eq(templateAutopublishRuns.idempotencyKey, idempotencyKey)).limit(1);
      if (!row) return null;
      return (await loadViews([row]))[0] ?? null;
    },

    async getGrant(id) {
      const [row] = await getDb().select().from(agentCapabilityGrants)
        .where(eq(agentCapabilityGrants.id, id)).limit(1);
      if (!row) return null;
      return {
        ...row,
        sourceConstraints: row.sourceConstraints as CapabilityGrant['sourceConstraints'],
        budget: row.budget as CapabilityGrant['budget'],
      };
    },

    async createRun(input) {
      const row = await getDb().transaction(async (tx) => {
        const [existing] = await tx.select().from(templateAutopublishRuns)
          .where(eq(templateAutopublishRuns.idempotencyKey, input.idempotencyKey)).limit(1);
        if (existing) {
          assertIdempotency(existing, input);
          return existing;
        }

        const [created] = await tx.insert(templateAutopublishRuns).values({
          status: 'queued',
          currentStage: 'queued',
          triggerType: input.triggerType,
          requestedBy: input.requestedBy,
          agentId: input.agentId,
          capabilityGrantId: input.capabilityGrantId,
          flowType: input.flowType,
          sourceType: input.sourceType,
          sourceItemId: input.sourceItemId,
          inputSnapshot: input.inputSnapshot,
          inputSnapshotHash: input.inputSnapshotHash,
          ruleSetId: input.ruleSetId,
          ruleSetVersion: input.ruleSetVersion,
          taxonomySnapshotHash: input.taxonomySnapshotHash,
          promptVersion: input.promptVersion,
          budgetSnapshot: input.budgetSnapshot,
          budgetConsumed: { modelCalls: 0, coverAttempts: 0, durationMinutes: 0 },
          idempotencyKey: input.idempotencyKey,
        }).onConflictDoNothing().returning();

        if (!created) {
          const [idempotent] = await tx.select().from(templateAutopublishRuns)
            .where(eq(templateAutopublishRuns.idempotencyKey, input.idempotencyKey)).limit(1);
          if (idempotent) {
            assertIdempotency(idempotent, input);
            return idempotent;
          }
          if (input.triggerType === 'scheduled_agent') {
            const [sameSource] = await tx.select({ id: templateAutopublishRuns.id })
              .from(templateAutopublishRuns)
              .where(and(
                eq(templateAutopublishRuns.triggerType, 'scheduled_agent'),
                eq(templateAutopublishRuns.sourceType, input.sourceType),
                eq(templateAutopublishRuns.sourceItemId, input.sourceItemId),
                eq(templateAutopublishRuns.flowType, input.flowType),
              )).limit(1);
            if (sameSource) throw new AutopublishServiceError('AUTOPUBLISH_SOURCE_ALREADY_EXISTS');
          }
          throw new AutopublishServiceError('AUTOPUBLISH_CREATE_CONFLICT');
        }

        await tx.insert(governanceAuditEvents).values({
          actorType: input.actor.type,
          actorId: null,
          eventType: 'autopublish.run_created',
          targetType: 'autopublish_run',
          targetId: created.id,
          payload: {
            agentId: input.actor.id,
            actorCapabilityGrantId: input.actor.capabilityGrantId,
            capabilityGrantId: input.capabilityGrantId,
            idempotencyKey: input.idempotencyKey,
            inputSnapshotHash: input.inputSnapshotHash,
            triggerType: input.triggerType,
            flowType: input.flowType,
            sourceType: input.sourceType,
            sourceItemId: input.sourceItemId,
            ruleSetId: input.ruleSetId,
            ruleSetVersion: input.ruleSetVersion,
            taxonomySnapshotHash: input.taxonomySnapshotHash,
            promptVersion: input.promptVersion,
            budgetSnapshot: input.budgetSnapshot,
          },
        });
        await tx.insert(templateAutopublishOutbox).values({
          runId: created.id,
          eventType: 'autopublish.run.start',
          dedupeKey: `run:${created.id}:start`,
          payload: { runId: created.id },
        });
        return created;
      });
      return toStoredRun(row);
    },

    getRunView: getView,

    async cancelRun(id, actor: AutopublishAdminActor, now) {
      await getDb().transaction(async (tx) => {
        await tx.execute(sql`select ${templateAutopublishRuns.id} from ${templateAutopublishRuns}
          where ${templateAutopublishRuns.id} = ${id} for update`);
        const [row] = await tx.select().from(templateAutopublishRuns)
          .where(eq(templateAutopublishRuns.id, id)).limit(1);
        if (!row) throw new AutopublishServiceError('AUTOPUBLISH_RUN_NOT_FOUND');
        if (TERMINAL_STATUSES.has(row.status)) {
          throw new AutopublishServiceError('AUTOPUBLISH_RUN_TERMINAL');
        }
        await tx.update(templateAutopublishRuns).set({
          status: 'cancelled',
          finishedAt: now,
          leaseToken: null,
          leaseUntil: null,
        }).where(eq(templateAutopublishRuns.id, id));
        await tx.insert(governanceAuditEvents).values({
          actorType: actor.type,
          actorId: actor.id,
          eventType: 'autopublish.run_cancelled',
          targetType: 'autopublish_run',
          targetId: id,
          payload: {},
        });
      });
      return (await getView(id))!;
    },

    async actRun(id, action, actor: AutopublishAdminActor, idempotencyKey) {
      const result = await getDb().transaction(async (tx) => {
        await tx.execute(sql`select ${templateAutopublishRuns.id} from ${templateAutopublishRuns}
          where ${templateAutopublishRuns.id} = ${id} for update`);
        const [row] = await tx.select().from(templateAutopublishRuns)
          .where(eq(templateAutopublishRuns.id, id)).limit(1);
        if (!row) throw new AutopublishServiceError('AUTOPUBLISH_RUN_NOT_FOUND');

        const [claim] = await tx.select({ payload: governanceAuditEvents.payload })
          .from(governanceAuditEvents)
          .where(and(
            eq(governanceAuditEvents.targetType, 'autopublish_run'),
            eq(governanceAuditEvents.targetId, id),
            eq(governanceAuditEvents.eventType, 'autopublish.recovery_action'),
            sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${idempotencyKey}`,
          )).limit(1);
        if (claim) {
          const claimedAction = (claim.payload as { action?: unknown }).action;
          if (claimedAction !== action) {
            throw new AutopublishServiceError('AUTOPUBLISH_ACTION_IDEMPOTENCY_MISMATCH');
          }
          return { replayed: true };
        }

        let changeSet: { status: string } | undefined;
        if (row.changeSetId) {
          [changeSet] = await tx.select({ status: governanceChangeSets.status })
            .from(governanceChangeSets).where(eq(governanceChangeSets.id, row.changeSetId)).limit(1);
        }
        if (!allowedActions(row, changeSet).includes(action)) {
          throw new AutopublishServiceError('AUTOPUBLISH_ACTION_FORBIDDEN');
        }
        if (action === 'retry_after_conflict' && row.errorCode === 'ACTIVE_GOVERNANCE_WORK_EXISTS') {
          if (!row.changeSetId) throw new AutopublishServiceError('ACTIVE_GOVERNANCE_WORK_EXISTS');
          if (!changeSet || !TERMINAL_CHANGE_SET_STATUSES.has(changeSet.status)) {
            throw new AutopublishServiceError('ACTIVE_GOVERNANCE_WORK_EXISTS');
          }
        }

        const stage = recoveryStageFor(row.errorCode, action);
        const [previous] = await tx.select({ attempt: templateAutopublishStageAttempts.attempt })
          .from(templateAutopublishStageAttempts)
          .where(and(
            eq(templateAutopublishStageAttempts.runId, id),
            eq(templateAutopublishStageAttempts.stage, stage),
          ))
          .orderBy(sql`${templateAutopublishStageAttempts.attempt} desc`)
          .limit(1);
        const attempt = (previous?.attempt ?? 0) + 1;
        await tx.insert(templateAutopublishStageAttempts).values({
          runId: id,
          stage,
          attempt,
          status: 'queued',
          inputHash: row.inputSnapshotHash,
          usage: {},
        });
        await tx.update(templateAutopublishRuns).set({
          status: 'queued',
          currentStage: stage,
          errorCode: null,
          errorDetails: null,
          finishedAt: null,
          leaseToken: null,
          leaseUntil: null,
        }).where(eq(templateAutopublishRuns.id, id));
        await tx.insert(governanceAuditEvents).values({
          actorType: actor.type,
          actorId: actor.id,
          eventType: 'autopublish.recovery_action',
          targetType: 'autopublish_run',
          targetId: id,
          payload: { action, idempotencyKey, stage, attempt },
        });
        await tx.insert(templateAutopublishOutbox).values({
          runId: id,
          eventType: 'autopublish.run.recover',
          dedupeKey: `run:${id}:action:${idempotencyKey}`,
          payload: { runId: id, action, stage, attempt },
        });
        return { replayed: false };
      });
      const view = await getView(id);
      if (!view) throw new AutopublishServiceError('AUTOPUBLISH_RUN_NOT_FOUND');
      return result.replayed ? view : view;
    },

    async listExceptionViews() {
      const rows = await getDb().select().from(templateAutopublishRuns)
        .where(inArray(templateAutopublishRuns.status, EXCEPTION_STATUSES))
        .orderBy(asc(templateAutopublishRuns.createdAt));
      return loadViews(rows);
    },
  };
}
