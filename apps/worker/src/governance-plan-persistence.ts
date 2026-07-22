import { eq } from 'drizzle-orm';
import { governanceChangeSetSummarySchema, governanceRuleSetSchema } from '@promptix/shared';
import { db, agentRuns, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets } from './db.js';
import { partitionGovernanceProposals } from './governance-change-set-partition.js';

type PlannedProposal = { templateId: string; baseVersion: number; current: unknown; action: string; proposedPatch: unknown; reasonCodes: string[]; explanation: string; confidence: number; riskLevel: string; requiresApproval: boolean };

export async function persistGovernancePlan(runId: string, proposals: PlannedProposal[]) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
    if (!run) throw new Error('Agent run not found');
    const existingSets = await tx.select().from(governanceChangeSets).where(eq(governanceChangeSets.runId, runId));
    if (existingSets.length) {
      const automaticSet = existingSets.find((set) => set.executionMode === 'automatic') ?? null;
      const approvalSet = existingSets.find((set) => set.executionMode === 'approval') ?? null;
      const automatic = Number((automaticSet?.summary as { total?: number } | undefined)?.total ?? 0);
      const approval = Number((approvalSet?.summary as { total?: number } | undefined)?.total ?? 0);
      return { runId, changeSetId: automaticSet?.id ?? approvalSet?.id ?? null, automaticChangeSetId: automaticSet?.id ?? null, approvalChangeSetId: approvalSet?.id ?? null, proposals: automatic + approval, automatic, approval };
    }
    if (!proposals.length) {
      await tx.update(agentRuns).set({ status: 'succeeded', stats: { total: 0, automatic: 0, awaitingApproval: 0, approved: 0, applied: 0, rejected: 0, conflicts: 0, skipped: 0, failed: 0, rolledBack: 0, deleted: 0, changeSets: 0 }, progress: { phase: 'completed', percent: 100 }, finishedAt: new Date() }).where(eq(agentRuns.id, run.id));
      return { runId, changeSetId: null, proposals: 0, automatic: 0, approval: 0 };
    }
    const [ruleSet] = await tx.select().from(governanceRuleSets).where(eq(governanceRuleSets.id, run.ruleSetId)).limit(1);
    if (!ruleSet || ruleSet.version !== run.ruleSetVersion) throw new Error('RULE_SET_CHANGED');
    const rules = governanceRuleSetSchema.parse(ruleSet.rules);
    const created = await tx.insert(governanceProposals).values(proposals.map((proposal) => ({ runId, templateId: proposal.templateId, baseVersion: proposal.baseVersion, currentSnapshot: proposal.current, action: proposal.action, proposedPatch: proposal.proposedPatch, reasonCodes: proposal.reasonCodes, explanation: proposal.explanation, confidence: String(proposal.confidence), riskLevel: proposal.riskLevel, requiresApproval: proposal.requiresApproval, validation: { valid: true, issues: [] }, status: proposal.requiresApproval ? 'awaiting_approval' : 'accepted' }))).returning();
    const partitioned = partitionGovernanceProposals(created);
    const approvalProposals = partitioned.approval;
    const automaticProposals = partitioned.automatic;
    const rollbackUntil = new Date(Date.now() + rules.rollbackHours * 60 * 60 * 1000);

    const createSet = async (mode: 'automatic' | 'approval', entries: typeof created) => {
      if (!entries.length) return null;
      const summary = governanceChangeSetSummarySchema.parse({
        total: entries.length,
        automatic: mode === 'automatic' ? entries.length : 0,
        awaitingApproval: mode === 'approval' ? entries.length : 0,
      });
      const [set] = await tx.insert(governanceChangeSets).values({
        runId,
        scopeSnapshot: run.scope,
        exclusionIds: [],
        ruleSetId: run.ruleSetId,
        ruleSetVersion: run.ruleSetVersion,
        idempotencyKey: `run:${runId}:${mode}:v2`,
        executionMode: mode,
        status: mode === 'approval' ? 'awaiting_approval' : 'planned',
        summary,
        rollbackUntil,
      }).returning();
      await tx.insert(governanceChangeSetItems).values(entries.map((proposal) => ({
        changeSetId: set.id,
        proposalId: proposal.id,
        templateId: proposal.templateId,
        status: mode === 'approval' ? 'awaiting_approval' : 'pending',
      })));
      return set;
    };

    const automaticSet = await createSet('automatic', automaticProposals);
    const approvalSet = await createSet('approval', approvalProposals);
    const automatic = automaticProposals.length;
    const approval = approvalProposals.length;
    await tx.update(agentRuns).set({ status: automatic ? 'planned' : 'awaiting_approval', stats: { proposals: created.length, automatic, awaitingApproval: approval, changeSets: Number(Boolean(automaticSet)) + Number(Boolean(approvalSet)) }, progress: { phase: 'planned', percent: 80 } }).where(eq(agentRuns.id, run.id));
    return { runId, changeSetId: automaticSet?.id ?? approvalSet?.id ?? null, automaticChangeSetId: automaticSet?.id ?? null, approvalChangeSetId: approvalSet?.id ?? null, proposals: created.length, automatic, approval };
  });
}
