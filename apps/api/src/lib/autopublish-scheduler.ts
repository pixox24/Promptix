import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { governanceRuleSets } from '../db/schema.js';
import { getJobQueue } from './queue.js';
import { parseStoredAutopublishRules } from './autopublish-rule-loader.js';

export const AUTOPUBLISH_SCHEDULER_ID = 'template-autopublish-source-scan';
export const ALLOWED_AUTOPUBLISH_SOURCE_TYPES = ['curated_queue', 'admin_source'] as const;

export function scheduledAutopublishCapacity(input: {
  enabled: boolean;
  pending: number;
  running: number;
  startedLastHour: number;
  maximumBatchSize: number;
  maximumConcurrentPerAgent: number;
  maximumRunsPerHour: number;
}) {
  if (!input.enabled) return 0;
  return Math.max(0, Math.min(
    input.pending,
    input.maximumBatchSize,
    input.maximumConcurrentPerAgent - input.running,
    input.maximumRunsPerHour - input.startedLastHour,
  ));
}

export async function registerAutopublishScheduler() {
  const [row] = await getDb().select().from(governanceRuleSets)
    .where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!row) return { enabled: false };
  const rules = parseStoredAutopublishRules(row.rules);
  if (!rules.scheduledAgentEnabled) {
    await getJobQueue().removeJobScheduler(AUTOPUBLISH_SCHEDULER_ID);
    return { enabled: false };
  }
  await getJobQueue().upsertJobScheduler(
    AUTOPUBLISH_SCHEDULER_ID,
    { pattern: '0 * * * *', tz: 'Asia/Shanghai' },
    {
      name: 'template-autopublish-source-scan',
      data: { kind: 'autopublish_source_scan', ruleSetId: row.id, ruleSetVersion: row.version },
      opts: { removeOnComplete: true, removeOnFail: 100 },
    },
  );
  return { enabled: true };
}
