import { eq } from 'drizzle-orm';
import { db, agentRuns, governanceChangeSetItems, governanceChangeSets, governanceProposals } from './db.js';

type PlannedProposal = { templateId: string; baseVersion: number; current: unknown; action: string; proposedPatch: unknown; reasonCodes: string[]; explanation: string; confidence: number; riskLevel: string; requiresApproval: boolean };

export async function persistGovernancePlan(runId: string, proposals: PlannedProposal[]) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    if (!run) throw new Error('Agent run not found');
    if (!proposals.length) {
      await tx.update(agentRuns).set({ status: 'succeeded', stats: { proposals: 0, automatic: 0, approval: 0 }, progress: { phase: 'completed', percent: 100 }, finishedAt: new Date() }).where(eq(agentRuns.id, run.id));
      return { runId, changeSetId: null, proposals: 0, automatic: 0, approval: 0 };
    }
    const created = await tx.insert(governanceProposals).values(proposals.map((proposal) => ({ runId, templateId: proposal.templateId, baseVersion: proposal.baseVersion, currentSnapshot: proposal.current, action: proposal.action, proposedPatch: proposal.proposedPatch, reasonCodes: proposal.reasonCodes, explanation: proposal.explanation, confidence: String(proposal.confidence), riskLevel: proposal.riskLevel, requiresApproval: proposal.requiresApproval, validation: { valid: true, issues: [] }, status: proposal.requiresApproval ? 'awaiting_approval' : 'accepted' }))).returning();
    const approval = created.filter((proposal) => proposal.requiresApproval).length;
    const automatic = created.length - approval;
    const [changeSet] = await tx.insert(governanceChangeSets).values({ runId, scopeSnapshot: run.scope, exclusionIds: [], ruleSetId: run.ruleSetId, ruleSetVersion: run.ruleSetVersion, idempotencyKey: `run:${runId}:plan:v1`, status: approval ? 'awaiting_approval' : 'planned', summary: { total: created.length, automatic, approval, conflict: 0, skipped: 0, failed: 0 }, rollbackUntil: new Date(Date.now() + 168 * 60 * 60 * 1000) }).returning();
    await tx.insert(governanceChangeSetItems).values(created.map((proposal) => ({ changeSetId: changeSet.id, proposalId: proposal.id, templateId: proposal.templateId, status: proposal.requiresApproval ? 'awaiting_approval' : 'pending' })));
    await tx.update(agentRuns).set({ status: approval ? 'awaiting_approval' : 'planned', stats: { proposals: created.length, automatic, approval }, progress: { phase: 'planned', percent: 80 } }).where(eq(agentRuns.id, run.id));
    return { runId, changeSetId: changeSet.id, proposals: created.length, automatic, approval };
  });
}
