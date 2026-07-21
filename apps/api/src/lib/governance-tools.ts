import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { governanceTemplateQuerySchema, type GovernanceTemplateQuery } from '@promptix/shared';
import { getDb } from '../db/client.js';
import {
  governanceApprovals,
  governanceAuditEvents,
  governanceChangeSetItems,
  governanceChangeSets,
  governanceProposals,
  promptTemplates,
  templateVersions,
} from '../db/schema.js';
import { buildGovernanceFilters, encodeGovernanceCursor, governanceOrder } from './governance-query.js';
import type { GovernanceService } from './governance-service.js';

export async function search_templates(input: {
  query: GovernanceTemplateQuery;
  pageSize: number;
  cursor?: { updatedAt: string; id: string };
}) {
  const query = governanceTemplateQuerySchema.parse(input.query);
  const filters = buildGovernanceFilters(query);
  if (input.cursor && query.sort === 'updated_desc') {
    const date = new Date(input.cursor.updatedAt);
    filters.push(or(lt(promptTemplates.updatedAt, date), and(eq(promptTemplates.updatedAt, date), lt(promptTemplates.id, input.cursor.id)))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const db = getDb();
  const [[count], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(promptTemplates).where(where),
    db.select({
      id: promptTemplates.id,
      name: promptTemplates.name,
      summary: promptTemplates.summary,
      status: promptTemplates.status,
      source: promptTemplates.source,
      taxonomyReviewStatus: promptTemplates.taxonomyReviewStatus,
      isFeatured: promptTemplates.isFeatured,
      featuredOrder: promptTemplates.featuredOrder,
      coverUrl: promptTemplates.coverUrl,
      currentVersion: promptTemplates.currentVersion,
      updatedAt: promptTemplates.updatedAt,
    }).from(promptTemplates).where(where).orderBy(...governanceOrder(query)).limit(input.pageSize + 1),
  ]);
  const hasMore = rows.length > input.pageSize;
  const items = rows.slice(0, input.pageSize);
  const last = items.at(-1);
  return {
    items,
    total: Number(count?.total ?? 0),
    nextCursor: hasMore && last ? encodeGovernanceCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null,
    querySnapshot: { ...query, capturedAt: new Date().toISOString() },
  };
}

export async function inspect_template(input: { templateId: string }) {
  const db = getDb();
  const [template] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, input.templateId)).limit(1);
  if (!template) return null;
  const [proposal, history] = await Promise.all([
    db.select().from(governanceProposals).where(eq(governanceProposals.templateId, template.id)).orderBy(desc(governanceProposals.createdAt)).limit(1),
    db.select().from(templateVersions).where(eq(templateVersions.templateId, template.id)).orderBy(desc(templateVersions.version)).limit(20),
  ]);
  let approval = null;
  if (proposal[0]) {
    const [item] = await db.select().from(governanceChangeSetItems).where(eq(governanceChangeSetItems.proposalId, proposal[0].id)).limit(1);
    if (item) {
      const [changeSet, latestApproval] = await Promise.all([
        db.select().from(governanceChangeSets).where(eq(governanceChangeSets.id, item.changeSetId)).limit(1),
        db.select().from(governanceApprovals).where(eq(governanceApprovals.changeSetId, item.changeSetId)).orderBy(desc(governanceApprovals.createdAt)).limit(1),
      ]);
      approval = { changeSet: changeSet[0] ?? null, decision: latestApproval[0] ?? null };
    }
  }
  return {
    template,
    currentSnapshot: history[0]?.snapshot ?? null,
    activeProposal: proposal[0] ?? null,
    reason: proposal[0]?.explanation ?? null,
    confidence: proposal[0]?.confidence ? Number(proposal[0].confidence) : null,
    history,
    approval,
  };
}

export async function validate_template(input: { templateId: string }) {
  const inspected = await inspect_template(input);
  if (!inspected) return { valid: false, issues: [{ code: 'NOT_FOUND', message: 'Template not found' }] };
  const issues: Array<{ code: string; message: string }> = [];
  if (!inspected.template.name.trim()) issues.push({ code: 'TITLE_REQUIRED', message: 'Title is required' });
  if (!inspected.template.promptTemplate.trim()) issues.push({ code: 'PROMPT_REQUIRED', message: 'Prompt template is required' });
  if (inspected.template.status === 'published' && !inspected.template.coverUrl) issues.push({ code: 'COVER_REQUIRED', message: 'Published templates require a cover' });
  if (inspected.template.status === 'published' && inspected.template.taxonomyReviewStatus !== 'reviewed') issues.push({ code: 'TAXONOMY_REVIEW_REQUIRED', message: 'Published templates require reviewed taxonomy' });
  return { valid: issues.length === 0, issues };
}

export const plan_changes = (service: GovernanceService, input: Parameters<GovernanceService['createRun']>[0]) => service.createRun(input);
export const preview_changes = async (input: { changeSetId: string }) => {
  const [changeSet] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, input.changeSetId)).limit(1);
  if (!changeSet) return null;
  const items = await getDb().select({ item: governanceChangeSetItems, proposal: governanceProposals }).from(governanceChangeSetItems)
    .innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id)).where(eq(governanceChangeSetItems.changeSetId, input.changeSetId));
  return { changeSet, items };
};
export const execute_auto_changes = (service: GovernanceService, input: Parameters<GovernanceService['retry']>[0]) => service.retry(input);
export const submit_for_approval = async (input: { changeSetId: string; idempotencyKey: string }) => {
  const updated = await getDb().transaction(async (tx) => {
    const [next] = await tx.update(governanceChangeSets).set({ status: 'awaiting_approval', updatedAt: new Date() })
      .where(and(eq(governanceChangeSets.id, input.changeSetId), eq(governanceChangeSets.status, 'planned'))).returning();
    if (next) await tx.insert(governanceAuditEvents).values({ actorType: 'system', eventType: 'governance.change_set_submitted', targetType: 'change_set', targetId: next.id, changeSetId: next.id, payload: { idempotencyKey: input.idempotencyKey } });
    return next;
  });
  return updated ?? null;
};
export const get_change_set_status = async (input: { changeSetId: string }) => {
  const [row] = await getDb().select({ id: governanceChangeSets.id, status: governanceChangeSets.status, summary: governanceChangeSets.summary }).from(governanceChangeSets).where(eq(governanceChangeSets.id, input.changeSetId)).limit(1);
  return row ?? null;
};
export const rollback_change_set = (service: GovernanceService, input: Parameters<GovernanceService['rollback']>[0]) => service.rollback(input);
