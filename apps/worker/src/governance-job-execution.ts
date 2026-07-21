import { and, eq, inArray, sql } from 'drizzle-orm';
import { classifyGovernanceRisk, governanceProposalPatchSchema, governanceRuleSetSchema, templateVersionSnapshotSchema, type GovernanceField } from '@promptix/shared';
import { db, agentRuns, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets, promptTemplates, taxonomyTerms, templateTaxonomyAssignments, templateVersions } from './db.js';

function mutationPatch(action: string, patch: Record<string, unknown>) {
  const allowed = ['name', 'summary', 'tags', 'promptTemplate', 'variables', 'isFeatured', 'featuredOrder'] as const;
  const result: Record<string, unknown> = {};
  for (const key of allowed) if (key in patch) result[key] = patch[key];
  if (action === 'publish') result.status = 'published';
  if (action === 'archive') result.status = 'archived';
  if (action === 'feature') result.isFeatured = true;
  if (action === 'unfeature') { result.isFeatured = false; result.featuredOrder = 0; }
  return result;
}

export async function executeGovernanceJob(changeSetId: string) {
  const [changeSet] = await db.select().from(governanceChangeSets).where(eq(governanceChangeSets.id, changeSetId)).limit(1);
  if (!changeSet) throw new Error('Change set not found');
  const [active] = await db.select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!active || active.id !== changeSet.ruleSetId || active.version !== changeSet.ruleSetVersion) throw new Error('RULE_SET_CHANGED');
  const rules = governanceRuleSetSchema.parse(active.rules);
  await db.update(agentRuns).set({ status: 'auto_executing', progress: { phase: 'executing', percent: 85 } }).where(eq(agentRuns.id, changeSet.runId));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_execution_started', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: { status: changeSet.status } });
  const rows = await db.select({ item: governanceChangeSetItems, proposal: governanceProposals }).from(governanceChangeSetItems).innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id)).where(eq(governanceChangeSetItems.changeSetId, changeSet.id));
  const outcomes: Array<{ itemId: string; status: string }> = [];
  for (const { item, proposal } of rows.filter(({ item }) => ['pending', 'approved', 'failed'].includes(item.status) || (item.status === 'awaiting_approval' && changeSet.status === 'approved'))) {
    try {
      const patch = governanceProposalPatchSchema.parse(proposal.proposedPatch);
      const decision = classifyGovernanceRisk({ action: proposal.action as never, changedFields: Object.keys(patch) as GovernanceField[], confidence: Number(proposal.confidence), batchSize: rows.length }, rules);
      if (decision.requiresApproval && changeSet.status !== 'approved') {
        await db.update(governanceChangeSetItems).set({ status: 'awaiting_approval', errorCode: 'APPROVAL_REQUIRED' }).where(eq(governanceChangeSetItems.id, item.id));
        outcomes.push({ itemId: item.id, status: 'awaiting_approval' }); continue;
      }
      if (proposal.action === 'delete') {
        const before = templateVersionSnapshotSchema.parse(proposal.currentSnapshot);
        const deleted = await db.transaction(async (tx) => {
          const [removed] = await tx.delete(promptTemplates).where(and(eq(promptTemplates.id, proposal.templateId), eq(promptTemplates.currentVersion, proposal.baseVersion))).returning({ id: promptTemplates.id });
          if (!removed) return false;
          await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_deleted', targetType: 'template', targetId: proposal.templateId, runId: proposal.runId, changeSetId: changeSet.id, payload: { action: 'delete', permanent: true, beforeSnapshot: before } });
          await tx.delete(governanceChangeSetItems).where(eq(governanceChangeSetItems.id, item.id));
          await tx.delete(governanceProposals).where(eq(governanceProposals.id, proposal.id));
          return true;
        });
        if (!deleted) {
          await db.update(governanceChangeSetItems).set({ status: 'conflict', errorCode: 'VERSION_CONFLICT', finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
          await db.update(governanceProposals).set({ status: 'conflict', updatedAt: new Date() }).where(eq(governanceProposals.id, proposal.id));
          outcomes.push({ itemId: item.id, status: 'conflict' });
        }
        else { outcomes.push({ itemId: item.id, status: 'applied' }); }
        continue;
      }
      const before = templateVersionSnapshotSchema.parse(proposal.currentSnapshot);
      const nextVersion = proposal.baseVersion + 1;
      const nextSnapshot = templateVersionSnapshotSchema.parse({ ...before, ...patch, ...mutationPatch(proposal.action, patch), version: nextVersion });
      const applied = await db.transaction(async (tx) => {
        const [updated] = await tx.update(promptTemplates).set({ ...mutationPatch(proposal.action, patch), currentVersion: sql`${promptTemplates.currentVersion} + 1`, updatedAt: new Date() }).where(and(eq(promptTemplates.id, proposal.templateId), eq(promptTemplates.currentVersion, proposal.baseVersion))).returning();
        if (!updated) return null;
        if (patch.semantic) {
          const semantic = patch.semantic; const slugs = [semantic.outputType, ...semantic.scenarios, ...semantic.styles, ...semantic.subjects].filter((value): value is string => Boolean(value));
          const terms = slugs.length ? await tx.select().from(taxonomyTerms).where(inArray(taxonomyTerms.slug, slugs)) : [];
          if (new Set(terms.map((term) => term.slug)).size !== new Set(slugs).size) throw new Error('INVALID_TAXONOMY');
          await tx.delete(templateTaxonomyAssignments).where(eq(templateTaxonomyAssignments.templateId, updated.id));
          const assignments = terms.filter((term) => term.dimension !== 'output_type').map((term) => ({ templateId: updated.id, termId: term.id, source: 'ai' }));
          if (assignments.length) await tx.insert(templateTaxonomyAssignments).values(assignments);
          const output = terms.find((term) => term.dimension === 'output_type');
          await tx.update(promptTemplates).set({ outputTypeId: output?.id ?? null, workflowType: semantic.workflowType, tags: semantic.tags, unmappedTerms: semantic.unmappedTerms, classificationMeta: { confidence: semantic.confidence }, taxonomyReviewStatus: semantic.unmappedTerms.length ? 'needs_attention' : 'pending' }).where(eq(promptTemplates.id, updated.id));
        }
        await tx.insert(templateVersions).values({ templateId: updated.id, version: nextVersion, snapshot: nextSnapshot, source: 'agent', runId: proposal.runId, changeSetId: changeSet.id });
        await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_applied', targetType: 'template', targetId: updated.id, runId: proposal.runId, changeSetId: changeSet.id, proposalId: proposal.id, payload: { action: proposal.action, beforeVersion: proposal.baseVersion, afterVersion: nextVersion, changedFields: Object.keys(patch), beforeSnapshot: before, afterSnapshot: nextSnapshot } });
        await tx.update(governanceChangeSetItems).set({ status: 'applied', appliedVersion: nextVersion, errorCode: null, errorMessage: null, finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
        await tx.update(governanceProposals).set({ status: 'applied', updatedAt: new Date() }).where(eq(governanceProposals.id, proposal.id));
        return updated;
      });
      if (!applied) { await db.update(governanceChangeSetItems).set({ status: 'conflict', errorCode: 'VERSION_CONFLICT', finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id)); outcomes.push({ itemId: item.id, status: 'conflict' }); }
      else outcomes.push({ itemId: item.id, status: 'applied' });
    } catch (error) {
      await db.update(governanceChangeSetItems).set({ status: 'failed', errorCode: error instanceof Error ? error.message : 'ITEM_EXECUTION_FAILED', finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id)); outcomes.push({ itemId: item.id, status: 'failed' });
    }
  }
  const finalItems = await db.select().from(governanceChangeSetItems).where(eq(governanceChangeSetItems.changeSetId, changeSet.id));
  const finalIds = new Set(finalItems.map((item) => item.id));
  const applied = finalItems.filter((item) => item.status === 'applied').length + outcomes.filter((outcome) => outcome.status === 'applied' && !finalIds.has(outcome.itemId)).length;
  const conflicts = finalItems.filter((item) => item.status === 'conflict').length;
  const failed = finalItems.filter((item) => item.status === 'failed').length;
  const awaitingApproval = finalItems.filter((item) => item.status === 'awaiting_approval').length;
  const status = failed || conflicts
    ? applied ? 'partially_succeeded' : 'failed'
    : awaitingApproval ? 'awaiting_approval' : 'rollback_available';
  const runStatus = failed || conflicts
    ? applied ? 'partially_succeeded' : 'failed'
    : awaitingApproval ? 'awaiting_approval' : 'succeeded';
  const summary = { ...(changeSet.summary as object), applied, conflicts, failed, awaitingApproval };
  await db.update(governanceChangeSets).set({ status, summary, executedAt: new Date(), updatedAt: new Date() }).where(eq(governanceChangeSets.id, changeSet.id));
  await db.update(agentRuns).set({ status: runStatus, stats: summary, progress: { phase: runStatus === 'awaiting_approval' ? 'awaiting_approval' : 'completed', percent: 100 }, finishedAt: runStatus === 'awaiting_approval' ? null : new Date() }).where(eq(agentRuns.id, changeSet.runId));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_execution_finished', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: summary });
  return { changeSetId, status, outcomes };
}

export async function rollbackGovernanceJob(changeSetId: string) {
  const [changeSet] = await db.select().from(governanceChangeSets).where(eq(governanceChangeSets.id, changeSetId)).limit(1);
  if (!changeSet) throw new Error('Change set not found');
  if (!changeSet.rollbackUntil || changeSet.rollbackUntil < new Date()) throw new Error('ROLLBACK_EXPIRED');
  const rows = await db.select({ item: governanceChangeSetItems, proposal: governanceProposals }).from(governanceChangeSetItems).innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id)).where(eq(governanceChangeSetItems.changeSetId, changeSet.id));
  for (const { item, proposal } of rows.filter(({ item }) => item.status === 'applied' && item.appliedVersion)) {
    if (proposal.action === 'delete') continue;
    const before = templateVersionSnapshotSchema.parse(proposal.currentSnapshot); const version = item.appliedVersion! + 1;
    await db.transaction(async (tx) => {
      const [restored] = await tx.update(promptTemplates).set({ name: before.name, summary: before.summary, description: before.description, workflowType: before.semantic.workflowType, tags: before.semantic.tags, variables: before.variables, promptTemplate: before.promptTemplate, negativePrompt: before.negativePrompt, coverObjectKey: before.coverObjectKey, coverUrl: before.coverUrl, status: before.status, isFeatured: before.isFeatured, featuredOrder: before.featuredOrder, locale: before.locale, currentVersion: sql`${promptTemplates.currentVersion} + 1`, updatedAt: new Date() }).where(and(eq(promptTemplates.id, proposal.templateId), eq(promptTemplates.currentVersion, item.appliedVersion!))).returning();
      if (!restored) throw new Error('VERSION_CONFLICT');
      await tx.insert(templateVersions).values({ templateId: restored.id, version, snapshot: { ...before, version }, source: 'rollback', runId: proposal.runId, changeSetId });
      await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_rolled_back', targetType: 'template', targetId: restored.id, runId: proposal.runId, changeSetId, proposalId: proposal.id, payload: { beforeVersion: item.appliedVersion, rollbackVersion: version, beforeSnapshot: before } });
      await tx.update(governanceChangeSetItems).set({ status: 'rolled_back', appliedVersion: version, finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
      await tx.update(governanceProposals).set({ status: 'rolled_back', updatedAt: new Date() }).where(eq(governanceProposals.id, proposal.id));
    });
  }
  await db.update(governanceChangeSets).set({ status: 'rolled_back', updatedAt: new Date() }).where(eq(governanceChangeSets.id, changeSetId));
  await db.update(agentRuns).set({ status: 'succeeded', progress: { phase: 'rolled_back', percent: 100 }, finishedAt: new Date() }).where(eq(agentRuns.id, changeSet.runId));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_rolled_back', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: { status: 'rolled_back' } });
  return { changeSetId, status: 'rolled_back' };
}
