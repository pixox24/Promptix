import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { deriveGovernanceRunState, type GovernanceRuleSet } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { agentRuns, governanceApprovals, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceOperationIdempotency, governanceProposals, governanceRuleSets, promptTemplates } from '../db/schema.js';
import type { GovernanceServiceRepository } from './governance-service.js';

export function createGovernanceRepository(): GovernanceServiceRepository {
  const refreshRunState = async (runId: string) => {
    const changeSets = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.runId, runId));
    const items = changeSets.length
      ? await getDb().select().from(governanceChangeSetItems).where(inArray(governanceChangeSetItems.changeSetId, changeSets.map((set) => set.id)))
      : [];
    const state = deriveGovernanceRunState({ changeSets, items });
    await getDb().update(agentRuns).set({
      status: state.status,
      stats: state.stats,
      progress: { phase: state.status, percent: state.terminal ? 100 : state.status === 'awaiting_approval' ? 90 : 80 },
      finishedAt: state.terminal ? new Date() : null,
    }).where(eq(agentRuns.id, runId));
  };

  return {
    async activeRules() {
      const [row] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
      if (!row) throw new Error('No active governance rule set');
      return { id: row.id, version: row.version, rules: row.rules as GovernanceRuleSet };
    },

    async createRun(input) {
      const [existing] = await getDb().select({ runId: governanceAuditEvents.runId }).from(governanceAuditEvents)
        .where(and(eq(governanceAuditEvents.eventType, 'governance.run_created'), sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${input.idempotencyKey}`)).limit(1);
      if (existing?.runId) {
        const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, existing.runId)).limit(1);
        if (run) return run;
      }
      return getDb().transaction(async (tx) => {
        const operationKey = `run:${input.idempotencyKey}`;
        const [claim] = await tx.insert(governanceOperationIdempotency).values({ operationKey, operation: 'create_run', response: null }).onConflictDoNothing().returning({ operationKey: governanceOperationIdempotency.operationKey });
        if (!claim) {
          const [record] = await tx.select({ response: governanceOperationIdempotency.response }).from(governanceOperationIdempotency).where(eq(governanceOperationIdempotency.operationKey, operationKey)).limit(1);
          const runId = record?.response && typeof record.response === 'object' ? (record.response as { runId?: string }).runId : undefined;
          if (runId) {
            const [run] = await tx.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
            if (run) return run;
          }
          throw new Error('IDEMPOTENCY_IN_PROGRESS');
        }
        const [run] = await tx.insert(agentRuns).values({ trigger: 'manual', goal: input.goal, scope: input.scope, promptVersion: input.promptVersion, ruleSetId: input.ruleSetId, ruleSetVersion: input.ruleSetVersion, requestedBy: input.requestedBy }).returning();
        await tx.insert(governanceAuditEvents).values({ actorType: 'admin', actorId: input.requestedBy, eventType: 'governance.run_created', targetType: 'agent_run', targetId: run.id, runId: run.id, payload: { idempotencyKey: input.idempotencyKey, scope: input.scope } });
        await tx.update(governanceOperationIdempotency).set({ response: { runId: run.id } }).where(eq(governanceOperationIdempotency.operationKey, operationKey));
        return run;
      });
    },

    async failRun(id, errorCode, message) {
      await getDb().update(agentRuns).set({ status: 'failed', errorCode, errorMessage: message, finishedAt: new Date() }).where(eq(agentRuns.id, id));
    },

    async loadChangeSet(id) {
      const [row] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, id)).limit(1);
      if (!row) return null;
      const proposals = await getDb().select({
        id: governanceProposals.id,
        templateId: governanceProposals.templateId,
        baseVersion: governanceProposals.baseVersion,
        action: governanceProposals.action,
        itemStatus: governanceChangeSetItems.status,
      }).from(governanceChangeSetItems)
        .innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id))
        .where(eq(governanceChangeSetItems.changeSetId, id));
      return { id: row.id, runId: row.runId, status: row.status, executionMode: row.executionMode, ruleSetVersion: row.ruleSetVersion, proposals };
    },

    async currentTemplateVersions(ids) {
      if (!ids.length) return new Map();
      const rows = await getDb().select({ id: promptTemplates.id, version: promptTemplates.currentVersion }).from(promptTemplates).where(and(inArray(promptTemplates.id, ids), isNull(promptTemplates.deletedAt)));
      return new Map(rows.map((row) => [row.id, row.version]));
    },

    async transitionChangeSet(input) {
      const expectedEvent = `governance.change_set_${input.to}`;
      const [replay] = await getDb().select().from(governanceAuditEvents).where(and(
        eq(governanceAuditEvents.targetId, input.id),
        eq(governanceAuditEvents.eventType, expectedEvent),
        sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${input.idempotencyKey}`,
      )).limit(1);
      if (replay) return { id: input.id, status: input.to, replayed: true };

      const result = await getDb().transaction(async (tx) => {
        const operationKey = `change-set:${input.id}:${input.to}:${input.idempotencyKey}`;
        const [claim] = await tx.insert(governanceOperationIdempotency).values({ operationKey, operation: `change_set_${input.to}`, response: null }).onConflictDoNothing().returning({ operationKey: governanceOperationIdempotency.operationKey });
        if (!claim) {
          const [record] = await tx.select({ response: governanceOperationIdempotency.response }).from(governanceOperationIdempotency).where(eq(governanceOperationIdempotency.operationKey, operationKey)).limit(1);
          const response = record?.response as { id: string; status: string; runId: string } | null | undefined;
          if (response) return { ...response, replayed: true };
          throw new Error('IDEMPOTENCY_IN_PROGRESS');
        }
        const [updated] = await tx.update(governanceChangeSets).set({ status: input.to, updatedAt: new Date() })
          .where(and(eq(governanceChangeSets.id, input.id), inArray(governanceChangeSets.status, input.from))).returning();
        if (!updated) throw new Error('INVALID_CHANGE_SET_STATE');

        const itemRows = await tx.select({ proposalId: governanceChangeSetItems.proposalId }).from(governanceChangeSetItems).where(eq(governanceChangeSetItems.changeSetId, input.id));
        const proposalIds = itemRows.map((row) => row.proposalId);
        if (input.to === 'approved') {
          await tx.update(governanceChangeSetItems).set({ status: 'pending', errorCode: null, errorMessage: null }).where(and(eq(governanceChangeSetItems.changeSetId, input.id), eq(governanceChangeSetItems.status, 'awaiting_approval')));
          if (proposalIds.length) await tx.update(governanceProposals).set({ status: 'approved', updatedAt: new Date() }).where(inArray(governanceProposals.id, proposalIds));
        }
        if (input.to === 'rejected') {
          await tx.update(governanceChangeSetItems).set({ status: 'rejected', finishedAt: new Date() }).where(and(eq(governanceChangeSetItems.changeSetId, input.id), eq(governanceChangeSetItems.status, 'awaiting_approval')));
          if (proposalIds.length) await tx.update(governanceProposals).set({ status: 'rejected', updatedAt: new Date() }).where(inArray(governanceProposals.id, proposalIds));
        }
        if (input.reviewerId) {
          await tx.insert(governanceApprovals).values({ changeSetId: input.id, decision: input.to === 'rejected' ? 'rejected' : 'approved', approvedScope: input.approvedScope ?? {}, reviewerId: input.reviewerId, note: input.note ?? '', ruleSetVersion: updated.ruleSetVersion });
        }
        await tx.insert(governanceAuditEvents).values({ actorType: input.reviewerId ? 'admin' : 'system', actorId: input.reviewerId, eventType: expectedEvent, targetType: 'change_set', targetId: input.id, runId: updated.runId, changeSetId: input.id, payload: { idempotencyKey: input.idempotencyKey, note: input.note } });
        const response = { id: updated.id, status: updated.status, runId: updated.runId };
        await tx.update(governanceOperationIdempotency).set({ response }).where(eq(governanceOperationIdempotency.operationKey, operationKey));
        return response;
      });
      await refreshRunState(result.runId);
      return { id: result.id, status: result.status, ...('replayed' in result ? { replayed: result.replayed } : {}) };
    },

    async failChangeSet(id, errorCode, message) {
      const [updated] = await getDb().update(governanceChangeSets).set({ status: 'failed', summary: { total: 0, automatic: 0, awaitingApproval: 0, failed: 1, errorCode, message }, updatedAt: new Date() }).where(eq(governanceChangeSets.id, id)).returning({ runId: governanceChangeSets.runId });
      if (updated) await refreshRunState(updated.runId);
    },

    async saveActiveRules(input) {
      return getDb().transaction(async (tx) => {
        const [latest] = await tx.select({ version: governanceRuleSets.version }).from(governanceRuleSets).orderBy(desc(governanceRuleSets.version)).limit(1);
        await tx.update(governanceRuleSets).set({ enabled: false, updatedAt: new Date() }).where(eq(governanceRuleSets.enabled, true));
        const [created] = await tx.insert(governanceRuleSets).values({ name: 'default', version: (latest?.version ?? 0) + 1, rules: input.rules, enabled: true, createdBy: input.actorId }).returning();
        await tx.insert(governanceAuditEvents).values({ actorType: 'admin', actorId: input.actorId, eventType: 'governance.rule_set_created', targetType: 'rule_set', targetId: created.id, payload: { version: created.version, agent: (input.rules as GovernanceRuleSet).agent } });
        return { id: created.id, version: created.version, rules: created.rules as GovernanceRuleSet };
      });
    },

    refreshRunState,
  };
}
