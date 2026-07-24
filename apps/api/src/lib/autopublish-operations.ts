import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  governanceAuditEvents,
  governanceRuleSets,
  templateAutopublishRuns,
} from '../db/schema.js';

type RuleRecord = { id?: string; version: number; rules: Record<string, any> };
type Repository = {
  activeRules(): Promise<RuleRecord>;
  createRules(input: { rules: Record<string, any>; actorId: string }): Promise<RuleRecord>;
  audit(input: Record<string, unknown>): Promise<void>;
  overview(): Promise<{ delegated?: number; scheduledAgent?: number; [key: string]: unknown }>;
};

export function createAutopublishOperations(repository: Repository) {
  async function change(input: {
    actorId: string;
    reason: string;
    frozen?: boolean;
    mode?: 'shadow' | 'live';
    delegatedEnabled?: boolean;
  }) {
    const active = await repository.activeRules();
    const current = active.rules.autopublish ?? {};
    const rules = {
      ...active.rules,
      autopublish: {
        ...current,
        ...(input.frozen === undefined ? {} : { frozen: input.frozen }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.delegatedEnabled === undefined
          ? {}
          : { delegatedEnabled: input.delegatedEnabled }),
      },
    };
    const created = await repository.createRules({ rules, actorId: input.actorId });
    await repository.audit({
      actorId: input.actorId,
      reason: input.reason,
      previousVersion: active.version,
      version: created.version,
      autopublish: created.rules.autopublish,
    });
    return created;
  }
  return {
    freeze(input: { actorId: string; reason: string }) {
      return change({ ...input, frozen: true, mode: 'shadow' });
    },
    unfreeze(input: { actorId: string; reason: string }) {
      return change({ ...input, frozen: false });
    },
    mode(input: { actorId: string; reason: string; mode: 'shadow' | 'live' }) {
      return change(input);
    },
    delegated(input: { actorId: string; reason: string; enabled: boolean }) {
      return change({ ...input, delegatedEnabled: input.enabled });
    },
    async overview() {
      const [raw, active] = await Promise.all([
        repository.overview(),
        repository.activeRules(),
      ]);
      const controls = active.rules.autopublish ?? {};
      return {
        ...raw,
        mode: controls.mode === 'live' ? 'live' : 'shadow',
        frozen: controls.frozen === true,
        delegatedEnabled: controls.delegatedEnabled === true,
        scheduledAgentEnabled: controls.scheduledAgentEnabled === true,
        triggers: {
          delegated: Number(raw.delegated ?? 0),
          scheduledAgent: Number(raw.scheduledAgent ?? 0),
        },
      };
    },
  };
}

export function databaseAutopublishOperations() {
  return createAutopublishOperations({
    async activeRules() {
      const [row] = await getDb().select().from(governanceRuleSets)
        .where(eq(governanceRuleSets.enabled, true)).limit(1);
      if (!row) throw new Error('AUTOPUBLISH_RULES_NOT_FOUND');
      return { id: row.id, version: row.version, rules: row.rules as Record<string, any> };
    },
    async createRules(input) {
      return getDb().transaction(async (tx) => {
        const [latest] = await tx.select().from(governanceRuleSets)
          .orderBy(desc(governanceRuleSets.version)).limit(1);
        await tx.update(governanceRuleSets).set({ enabled: false })
          .where(eq(governanceRuleSets.enabled, true));
        const [created] = await tx.insert(governanceRuleSets).values({
          name: 'default',
          version: (latest?.version ?? 0) + 1,
          rules: input.rules,
          enabled: true,
          createdBy: input.actorId,
        }).returning();
        return { id: created.id, version: created.version, rules: created.rules as Record<string, any> };
      });
    },
    async audit(input) {
      await getDb().insert(governanceAuditEvents).values({
        actorType: 'admin',
        actorId: String(input.actorId),
        eventType: 'autopublish.rules_changed',
        targetType: 'governance_rule_set',
        targetId: String(input.version),
        payload: input,
      });
    },
    async overview() {
      const rows = await getDb().select({
        triggerType: templateAutopublishRuns.triggerType,
        count: sql<number>`count(*)::int`,
      }).from(templateAutopublishRuns).groupBy(templateAutopublishRuns.triggerType);
      return {
        delegated: rows.find((row) => row.triggerType === 'delegated')?.count ?? 0,
        scheduledAgent: rows.find((row) => row.triggerType === 'scheduled_agent')?.count ?? 0,
      };
    },
  });
}
