import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import type { GovernanceQueueId } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { agentRuns, governanceApprovals, governanceChangeSetItems, governanceChangeSets, governanceProposals } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { GovernanceQueryValidationError, parseGovernancePageQuery } from '../lib/governance-query.js';
import { inspect_template, search_templates, validate_template } from '../lib/governance-tools.js';
import { fail, ok } from '../lib/response.js';

export const governanceRoutes = new Hono<AdminVars>();
governanceRoutes.use('*', requireAdmin);

const QUEUES: GovernanceQueueId[] = [
  'taxonomy_confirmation', 'duplicate_candidates', 'quality_issues',
  'featured_candidates', 'pending_approval', 'failed_items',
];

governanceRoutes.get('/queues', async (c) => {
  const queues = await Promise.all(QUEUES.map(async (id) => {
    const result = await search_templates({ query: { queue: id, scenarios: [], styles: [], subjects: [], sort: 'updated_desc' }, pageSize: 1 });
    return { id, count: result.total };
  }));
  return ok(c, queues);
});

governanceRoutes.get('/templates', async (c) => {
  try {
    const parsed = parseGovernancePageQuery(new URL(c.req.url).searchParams);
    return ok(c, await search_templates(parsed));
  } catch (error) {
    if (error instanceof GovernanceQueryValidationError) return fail(c, error.code, error.message, 400);
    throw error;
  }
});

governanceRoutes.get('/templates/:id', async (c) => {
  const detail = await inspect_template({ templateId: c.req.param('id') });
  return detail ? ok(c, { ...detail, validation: await validate_template({ templateId: c.req.param('id') }) }) : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

governanceRoutes.get('/runs', async (c) => {
  const rows = await getDb().select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(100);
  return ok(c, { items: rows });
});

governanceRoutes.get('/runs/:id', async (c) => {
  const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, c.req.param('id'))).limit(1);
  if (!run) return fail(c, 'NOT_FOUND', 'Agent run not found', 404);
  const proposals = await getDb().select().from(governanceProposals).where(eq(governanceProposals.runId, run.id)).orderBy(desc(governanceProposals.createdAt));
  return ok(c, { ...run, proposals });
});

governanceRoutes.get('/change-sets/:id', async (c) => {
  const [changeSet] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, c.req.param('id'))).limit(1);
  if (!changeSet) return fail(c, 'NOT_FOUND', 'Change set not found', 404);
  const [items, approvals] = await Promise.all([
    getDb().select().from(governanceChangeSetItems).where(eq(governanceChangeSetItems.changeSetId, changeSet.id)),
    getDb().select().from(governanceApprovals).where(eq(governanceApprovals.changeSetId, changeSet.id)).orderBy(desc(governanceApprovals.createdAt)),
  ]);
  return ok(c, { ...changeSet, items, approvals });
});

governanceRoutes.get('/change-sets/:id/preview', async (c) => {
  const [changeSet] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, c.req.param('id'))).limit(1);
  if (!changeSet) return fail(c, 'NOT_FOUND', 'Change set not found', 404);
  const items = await getDb().select({ item: governanceChangeSetItems, proposal: governanceProposals })
    .from(governanceChangeSetItems)
    .innerJoin(governanceProposals, eq(governanceChangeSetItems.proposalId, governanceProposals.id))
    .where(eq(governanceChangeSetItems.changeSetId, changeSet.id));
  return ok(c, { changeSet, items: items.map(({ item, proposal }) => ({ ...item, proposal })) });
});
