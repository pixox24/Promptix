import { and, eq, inArray, sql } from 'drizzle-orm';
import { classifyGovernanceRisk, governanceProposalPatchSchema, governanceRuleSetSchema, templateVersionSnapshotSchema, type GovernanceField } from '@promptix/shared';
import { db, agentRuns, governanceApprovals, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceExecutionPermits, governanceProposals, governanceRuleSets, promptTemplates, taxonomyTerms, templateTaxonomyAssignments, templateVersions } from './db.js';
import { refreshGovernanceRunState } from './governance-run-state.js';

function mutationPatch(action: string, patch: Record<string, unknown>) {
  const allowed = ['name', 'summary', 'tags', 'promptTemplate', 'variables', 'isFeatured', 'featuredOrder'] as const;
  const result: Record<string, unknown> = {};
  for (const key of allowed) if (key in patch) result[key] = patch[key];
  if (action === 'publish') { result.status = 'published'; result.publishedAt = new Date(); }
  if (action === 'archive') result.status = 'archived';
  if (action === 'feature') result.isFeatured = true;
  if (action === 'unfeature') { result.isFeatured = false; result.featuredOrder = 0; }
  return result;
}

export async function executeGovernanceJob(changeSetId: string) {
  const [changeSet] = await db.select().from(governanceChangeSets).where(eq(governanceChangeSets.id, changeSetId)).limit(1);
  if (!changeSet) throw new Error('Change set not found');
  if (['succeeded', 'partially_succeeded', 'rollback_available', 'rolled_back'].includes(changeSet.status)) return { changeSetId, status: changeSet.status, outcomes: [] };
  if (!['automatic', 'approval', 'autopilot'].includes(changeSet.executionMode)) throw new Error('LEGACY_MIXED_CHANGE_SET_REQUIRES_REPAIR');
  if (changeSet.executionMode === 'approval' && changeSet.status !== 'approved' && changeSet.status !== 'auto_executing') throw new Error('APPROVAL_REQUIRED');
  if (changeSet.executionMode === 'autopilot') {
    if (!changeSet.permitId) throw new Error('AUTOPILOT_PERMIT_REQUIRED');
    const [permit] = await db.select().from(governanceExecutionPermits).where(eq(governanceExecutionPermits.id, changeSet.permitId)).limit(1);
    if (!permit || permit.revokedAt || !permit.consumedAt || permit.autopublishRunId === null
      || permit.ruleSetId !== changeSet.ruleSetId || permit.ruleSetVersion !== changeSet.ruleSetVersion
      || permit.action !== 'publish') throw new Error('AUTOPILOT_PERMIT_INVALID');
  }
  const [active] = await db.select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!active || active.id !== changeSet.ruleSetId || active.version !== changeSet.ruleSetVersion) throw new Error('RULE_SET_CHANGED');
  const rules = governanceRuleSetSchema.parse(active.rules);
  const [claimedSet] = await db.update(governanceChangeSets).set({ status: 'auto_executing', updatedAt: new Date() }).where(and(eq(governanceChangeSets.id, changeSet.id), inArray(governanceChangeSets.status, ['planned', 'approved', 'auto_executing']))).returning({ id: governanceChangeSets.id });
  if (!claimedSet) throw new Error('CHANGE_SET_NOT_EXECUTABLE');
  await db.update(governanceChangeSetItems).set({ status: 'pending', startedAt: null }).where(and(eq(governanceChangeSetItems.changeSetId, changeSet.id), eq(governanceChangeSetItems.status, 'running'), sql`${governanceChangeSetItems.startedAt} < now() - interval '10 minutes'`));
  await db.update(agentRuns).set({ status: 'auto_executing', progress: { phase: 'executing', percent: 85 } }).where(eq(agentRuns.id, changeSet.runId));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_execution_started', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: { status: changeSet.status } });
  const rows = await db.select({ item: governanceChangeSetItems, proposal: governanceProposals }).from(governanceChangeSetItems).innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id)).where(eq(governanceChangeSetItems.changeSetId, changeSet.id));
  const outcomes: Array<{ itemId: string; status: string }> = [];
  for (const { item, proposal } of rows.filter(({ item }) => ['pending', 'approved', 'failed'].includes(item.status) || (item.status === 'awaiting_approval' && changeSet.status === 'approved'))) {
    const [claimedItem] = await db.update(governanceChangeSetItems).set({ status: 'running', startedAt: new Date(), errorCode: null, errorMessage: null }).where(and(eq(governanceChangeSetItems.id, item.id), inArray(governanceChangeSetItems.status, ['pending', 'approved', 'failed']))).returning({ id: governanceChangeSetItems.id });
    if (!claimedItem) continue;
    try {
      const patch = governanceProposalPatchSchema.parse(proposal.proposedPatch);
      const decision = classifyGovernanceRisk({ action: proposal.action as never, changedFields: Object.keys(patch) as GovernanceField[], confidence: Number(proposal.confidence), batchSize: rows.length }, rules);
      if (decision.requiresApproval && changeSet.status !== 'approved' && changeSet.executionMode !== 'autopilot') {
        await db.update(governanceChangeSetItems).set({ status: 'failed', errorCode: 'RULE_REQUIRES_APPROVAL', errorMessage: 'Rules now require approval; regenerate this plan', finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
        outcomes.push({ itemId: item.id, status: 'failed' }); continue;
      }
      if (proposal.action === 'delete') {
        const before = templateVersionSnapshotSchema.parse(proposal.currentSnapshot);
        const [approval] = changeSet.executionMode === 'approval'
          ? await db.select({ note: governanceApprovals.note }).from(governanceApprovals).where(and(eq(governanceApprovals.changeSetId, changeSet.id), eq(governanceApprovals.decision, 'approved'))).orderBy(sql`${governanceApprovals.createdAt} desc`).limit(1)
          : [];
        const deleted = await db.transaction(async (tx) => {
          const nextVersion = proposal.baseVersion + 1;
          const [removed] = await tx.update(promptTemplates).set({ deletedAt: new Date(), deletionReason: approval?.note?.trim() || `governance:${proposal.runId}`, currentVersion: sql`${promptTemplates.currentVersion} + 1`, updatedAt: new Date() }).where(and(eq(promptTemplates.id, proposal.templateId), eq(promptTemplates.currentVersion, proposal.baseVersion), sql`${promptTemplates.deletedAt} is null`)).returning();
          if (!removed) return false;
          await tx.insert(templateVersions).values({ templateId: removed.id, version: nextVersion, snapshot: { ...before, snapshotSchemaVersion: 2, version: nextVersion }, source: 'agent', runId: proposal.runId, changeSetId: changeSet.id });
          await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_deleted', targetType: 'template', targetId: proposal.templateId, runId: proposal.runId, changeSetId: changeSet.id, proposalId: proposal.id, payload: { action: 'delete', permanent: true, tombstone: true, beforeSnapshot: before } });
          await tx.update(governanceChangeSetItems).set({ status: 'applied', appliedVersion: nextVersion, errorCode: 'DELETED', finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
          await tx.update(governanceProposals).set({ status: 'applied', updatedAt: new Date() }).where(eq(governanceProposals.id, proposal.id));
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
      const nextSnapshot = templateVersionSnapshotSchema.parse({
        ...before,
        ...patch,
        ...mutationPatch(proposal.action, patch),
        semantic: {
          ...before.semantic,
          ...(patch.semantic ?? {}),
          tags: patch.tags ?? patch.semantic?.tags ?? before.semantic.tags,
        },
        publishedAt: proposal.action === 'publish' ? new Date().toISOString() : before.publishedAt,
        snapshotSchemaVersion: 2,
        version: nextVersion,
      });
      const applied = await db.transaction(async (tx) => {
        let persistedSnapshot = nextSnapshot;
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
          persistedSnapshot = templateVersionSnapshotSchema.parse({
            ...nextSnapshot,
            taxonomyAssignments: terms.map((term) => ({ termId: term.id, slug: term.slug, dimension: term.dimension, source: 'ai', confidence: null })),
            taxonomyReviewStatus: semantic.unmappedTerms.length ? 'needs_attention' : 'pending',
            taxonomyReviewedAt: null,
            taxonomyReviewedBy: null,
          });
        }
        await tx.insert(templateVersions).values({ templateId: updated.id, version: nextVersion, snapshot: persistedSnapshot, source: 'agent', runId: proposal.runId, changeSetId: changeSet.id });
        await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_applied', targetType: 'template', targetId: updated.id, runId: proposal.runId, changeSetId: changeSet.id, proposalId: proposal.id, payload: { action: proposal.action, beforeVersion: proposal.baseVersion, afterVersion: nextVersion, changedFields: Object.keys(patch), beforeSnapshot: before, afterSnapshot: persistedSnapshot } });
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
  const summary = { ...(changeSet.summary as object), applied, conflicts, failed, awaitingApproval };
  await db.update(governanceChangeSets).set({ status, summary, executedAt: new Date(), updatedAt: new Date() }).where(eq(governanceChangeSets.id, changeSet.id));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_execution_finished', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: summary });
  await refreshGovernanceRunState(changeSet.runId);
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
    try {
      await db.transaction(async (tx) => {
      const assignmentIds = before.taxonomyAssignments.map((assignment) => assignment.termId);
      const terms = assignmentIds.length
        ? await tx.select().from(taxonomyTerms).where(inArray(taxonomyTerms.id, assignmentIds))
        : [];
      const outputTerm = before.semantic.outputType
        ? (terms.find((term) => term.dimension === 'output_type' && term.slug === before.semantic.outputType)
          ?? (await tx.select().from(taxonomyTerms).where(eq(taxonomyTerms.slug, before.semantic.outputType)).limit(1))[0])
        : null;
      const [restored] = await tx.update(promptTemplates).set({
        name: before.name,
        summary: before.summary,
        description: before.description,
        category: before.category ?? 'general',
        workflowType: before.semantic.workflowType,
        outputTypeId: outputTerm?.id ?? null,
        tags: before.semantic.tags,
        scenarios: before.semantic.scenarios,
        variables: before.variables,
        promptTemplate: before.promptTemplate,
        negativePrompt: before.negativePrompt,
        coverObjectKey: before.coverObjectKey,
        coverUrl: before.coverUrl,
        status: before.status,
        publishedAt: before.publishedAt ? new Date(before.publishedAt) : null,
        isFeatured: before.isFeatured,
        featuredOrder: before.featuredOrder,
        isHot: before.isHot,
        source: before.source,
        sourceMeta: before.sourceMeta,
        modelHints: before.modelHints,
        i18n: before.i18n,
        locale: before.locale,
        unmappedTerms: before.semantic.unmappedTerms,
        classificationMeta: { confidence: before.semantic.confidence },
        taxonomyReviewStatus: (before as typeof before & { taxonomyReviewStatus?: string }).taxonomyReviewStatus ?? (before.semantic.unmappedTerms.length ? 'needs_attention' : 'pending'),
        taxonomyReviewedAt: before.taxonomyReviewedAt ? new Date(before.taxonomyReviewedAt) : null,
        taxonomyReviewedBy: before.taxonomyReviewedBy,
        currentVersion: sql`${promptTemplates.currentVersion} + 1`,
        updatedAt: new Date(),
      }).where(and(eq(promptTemplates.id, proposal.templateId), eq(promptTemplates.currentVersion, item.appliedVersion!))).returning();
      if (!restored) throw new Error('VERSION_CONFLICT');
      await tx.delete(templateTaxonomyAssignments).where(eq(templateTaxonomyAssignments.templateId, restored.id));
      const restoredAssignments = terms
        .filter((term) => term.dimension !== 'output_type')
        .map((term) => {
          const snapshotAssignment = before.taxonomyAssignments.find((assignment) => assignment.termId === term.id);
          return { templateId: restored.id, termId: term.id, source: snapshotAssignment?.source ?? 'migration', confidence: snapshotAssignment?.confidence == null ? null : String(snapshotAssignment.confidence) };
        });
      if (restoredAssignments.length) await tx.insert(templateTaxonomyAssignments).values(restoredAssignments);
      await tx.insert(templateVersions).values({ templateId: restored.id, version, snapshot: { ...before, snapshotSchemaVersion: 2, version }, source: 'rollback', runId: proposal.runId, changeSetId });
      await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.template_rolled_back', targetType: 'template', targetId: restored.id, runId: proposal.runId, changeSetId, proposalId: proposal.id, payload: { beforeVersion: item.appliedVersion, rollbackVersion: version, beforeSnapshot: before } });
      await tx.update(governanceChangeSetItems).set({ status: 'rolled_back', appliedVersion: version, finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
      await tx.update(governanceProposals).set({ status: 'rolled_back', updatedAt: new Date() }).where(eq(governanceProposals.id, proposal.id));
      });
    } catch (error) {
      const code = error instanceof Error && error.message === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'ROLLBACK_FAILED';
      await db.update(governanceChangeSetItems).set({ status: code === 'VERSION_CONFLICT' ? 'conflict' : 'failed', errorCode: code, errorMessage: error instanceof Error ? error.message : String(error), finishedAt: new Date() }).where(eq(governanceChangeSetItems.id, item.id));
    }
  }
  const finalItems = await db.select().from(governanceChangeSetItems).where(eq(governanceChangeSetItems.changeSetId, changeSetId));
  const rolledBack = finalItems.filter((item) => item.status === 'rolled_back').length;
  const conflicts = finalItems.filter((item) => item.status === 'conflict').length;
  const failed = finalItems.filter((item) => item.status === 'failed').length;
  const status = conflicts || failed ? rolledBack ? 'partially_succeeded' : 'failed' : 'rolled_back';
  await db.update(governanceChangeSets).set({ status, summary: { ...(changeSet.summary as object), rolledBack, conflicts, failed }, updatedAt: new Date() }).where(eq(governanceChangeSets.id, changeSetId));
  await db.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_rolled_back', targetType: 'change_set', targetId: changeSet.id, runId: changeSet.runId, changeSetId: changeSet.id, payload: { status, rolledBack, conflicts, failed } });
  await refreshGovernanceRunState(changeSet.runId);
  return { changeSetId, status };
}
