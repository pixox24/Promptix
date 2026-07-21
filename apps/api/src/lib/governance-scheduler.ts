import type { GovernanceRuleSet } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { governanceRuleSets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getJobQueue } from './queue.js';

export const GOVERNANCE_SCHEDULER_ID = 'template-governance-default';
let lastSchedulerError: string | null = null;

export type GovernanceSchedulerQueue = {
  upsertJobScheduler(id: string, repeat: { pattern: string; tz: string }, template: { name: string; data: unknown; opts: { removeOnComplete: boolean; removeOnFail: number } }): Promise<unknown>;
  removeJobScheduler(id: string): Promise<boolean>;
};

export async function syncGovernanceScheduler(input: {
  queue: GovernanceSchedulerQueue;
  ruleSet: { id: string; version: number; rules: GovernanceRuleSet };
}) {
  if (!input.ruleSet.rules.schedule.enabled) {
    await input.queue.removeJobScheduler(GOVERNANCE_SCHEDULER_ID);
    return { enabled: false, schedulerId: GOVERNANCE_SCHEDULER_ID };
  }
  await input.queue.upsertJobScheduler(
    GOVERNANCE_SCHEDULER_ID,
    { pattern: input.ruleSet.rules.schedule.cron, tz: input.ruleSet.rules.schedule.timezone },
    { name: 'template-governance-scheduled-patrol', data: { kind: 'governance_schedule', ruleSetId: input.ruleSet.id, ruleSetVersion: input.ruleSet.version }, opts: { removeOnComplete: true, removeOnFail: 100 } },
  );
  return { enabled: true, schedulerId: GOVERNANCE_SCHEDULER_ID };
}

export async function registerGovernanceScheduler() {
  try {
    const [row] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
    if (!row) return { enabled: false, schedulerId: GOVERNANCE_SCHEDULER_ID };
    const result = await syncGovernanceScheduler({ queue: getJobQueue(), ruleSet: { id: row.id, version: row.version, rules: row.rules as GovernanceRuleSet } });
    lastSchedulerError = null;
    return result;
  } catch (error) {
    lastSchedulerError = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: 'error', event: 'governance_scheduler_failed', error: lastSchedulerError }));
    return { enabled: false, schedulerId: GOVERNANCE_SCHEDULER_ID, error: lastSchedulerError };
  }
}

export function governanceSchedulerStatus() { return { schedulerId: GOVERNANCE_SCHEDULER_ID, error: lastSchedulerError }; }
