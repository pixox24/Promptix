import { eq, inArray } from 'drizzle-orm';
import { deriveGovernanceRunState } from '@promptix/shared';
import { agentRuns, db, governanceChangeSetItems, governanceChangeSets } from './db.js';

export async function refreshGovernanceRunState(runId: string) {
  const changeSets = await db.select().from(governanceChangeSets).where(eq(governanceChangeSets.runId, runId));
  const items = changeSets.length
    ? await db.select().from(governanceChangeSetItems).where(inArray(governanceChangeSetItems.changeSetId, changeSets.map((set) => set.id)))
    : [];

  const { status, stats, terminal } = deriveGovernanceRunState({ changeSets, items });
  await db.update(agentRuns).set({
    status,
    stats,
    progress: { phase: status, percent: terminal ? 100 : status === 'awaiting_approval' ? 90 : 80 },
    finishedAt: terminal ? new Date() : null,
  }).where(eq(agentRuns.id, runId));

  return { status, stats };
}
