import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { GovernanceRuleSet } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { agentRuns, governanceApprovals, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets, promptTemplates } from '../db/schema.js';
import type { GovernanceServiceRepository } from './governance-service.js';

export function createGovernanceRepository(): GovernanceServiceRepository {
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
        const [run] = await tx.insert(agentRuns).values({ trigger: 'manual', goal: input.goal, scope: input.scope, promptVersion: input.promptVersion, ruleSetId: input.ruleSetId, ruleSetVersion: input.ruleSetVersion, requestedBy: input.requestedBy }).returning();
        await tx.insert(governanceAuditEvents).values({ actorType: 'admin', actorId: input.requestedBy, eventType: 'governance.run_created', targetType: 'agent_run', targetId: run.id, runId: run.id, payload: { idempotencyKey: input.idempotencyKey, scope: input.scope } });
        return run;
      });
    },
    async failRun(id, errorCode, message) { await getDb().update(agentRuns).set({ status: 'failed', errorCode, errorMessage: message, finishedAt: new Date() }).where(eq(agentRuns.id, id)); },
    async loadChangeSet(id) {
      const [row] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, id)).limit(1);
      if (!row) return null;
      const proposals = await getDb().select({ id: governanceProposals.id, templateId: governanceProposals.templateId, baseVersion: governanceProposals.baseVersion, action: governanceProposals.action })
        .from(governanceChangeSetItems).innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id)).where(eq(governanceChangeSetItems.changeSetId, id));
      return { id: row.id, status: row.status, ruleSetVersion: row.ruleSetVersion, proposals };
    },
    async currentTemplateVersions(ids) {
      if (!ids.length) return new Map();
      const rows = await getDb().select({ id: promptTemplates.id, version: promptTemplates.currentVersion }).from(promptTemplates).where(inArray(promptTemplates.id, ids));
      return new Map(rows.map((row) => [row.id, row.version]));
    },
    async transitionChangeSet(input) {
      const [replay] = await getDb().select().from(governanceAuditEvents).where(and(eq(governanceAuditEvents.targetId, input.id), sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${input.idempotencyKey}`)).limit(1);
      if (replay) return { id: input.id, status: input.to, replayed: true };
      return getDb().transaction(async (tx) => {
        const [updated] = await tx.update(governanceChangeSets).set({ status: input.to, updatedAt: new Date() }).where(and(eq(governanceChangeSets.id, input.id), inArray(governanceChangeSets.status, input.from))).returning();
        if (!updated) throw new Error('INVALID_CHANGE_SET_STATE');
        if (input.reviewerId) await tx.insert(governanceApprovals).values({ changeSetId: input.id, decision: input.to === 'rejected' ? 'rejected' : 'approved', approvedScope: input.approvedScope ?? {}, reviewerId: input.reviewerId, note: input.note ?? '', ruleSetVersion: updated.ruleSetVersion });
        await tx.insert(governanceAuditEvents).values({ actorType: input.reviewerId ? 'admin' : 'system', actorId: input.reviewerId, eventType: `governance.change_set_${input.to}`, targetType: 'change_set', targetId: input.id, changeSetId: input.id, payload: { idempotencyKey: input.idempotencyKey, note: input.note } });
        return { id: updated.id, status: updated.status };
      });
    },
    async failChangeSet(id, errorCode, message) { await getDb().update(governanceChangeSets).set({ status: 'failed', summary: { errorCode, message }, updatedAt: new Date() }).where(eq(governanceChangeSets.id, id)); },
    async saveActiveRules(input) {
      return getDb().transaction(async (tx) => {
        const [latest] = await tx.select({ version: governanceRuleSets.version }).from(governanceRuleSets).orderBy(desc(governanceRuleSets.version)).limit(1);
        await tx.update(governanceRuleSets).set({ enabled: false, updatedAt: new Date() }).where(eq(governanceRuleSets.enabled, true));
        const [created] = await tx.insert(governanceRuleSets).values({ name: 'default', version: (latest?.version ?? 0) + 1, rules: input.rules, enabled: true, createdBy: input.actorId }).returning();
        await tx.insert(governanceAuditEvents).values({ actorType: 'admin', actorId: input.actorId, eventType: 'governance.rule_set_created', targetType: 'rule_set', targetId: created.id, payload: { version: created.version, agent: (input.rules as GovernanceRuleSet).agent } });
        return { id: created.id, version: created.version, rules: created.rules as GovernanceRuleSet };
      });
    },
  };
}
