import { Hono } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import { governanceRuleSetSchema, governanceSelectionScopeSchema, modelCapabilitySchema, type GovernanceQueueId } from '@promptix/shared';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { agentRuns, generationJobs, governanceApprovals, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets, providerModels, providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { GovernanceQueryValidationError, parseGovernancePageQuery } from '../lib/governance-query.js';
import { inspect_template, search_templates, submit_for_approval, validate_template } from '../lib/governance-tools.js';
import { fail, ok } from '../lib/response.js';
import { createGovernanceRepository } from '../lib/governance-repository.js';
import { GovernanceService, GovernanceStateError } from '../lib/governance-service.js';
import { enqueueGenerationJob } from '../lib/job-enqueue.js';

const commandInput = z.object({
  goal: z.string().trim().min(1).max(2_000),
  scope: governanceSelectionScopeSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
});
const actionInput = z.object({ idempotencyKey: z.string().trim().min(8).max(200), note: z.string().max(2_000).default(''), deleteConfirmation: z.string().optional() });
const changeSetInput = z.object({ runId: z.string().uuid(), proposalIds: z.array(z.string().uuid()).min(1).max(1_000), idempotencyKey: z.string().trim().min(8).max(200) });

function service() {
  return new GovernanceService(createGovernanceRepository(), {
    enqueue: async ({ type, targetId }) => {
      let modelId: string | undefined; let providerId: string | undefined;
      if (type === 'template_governance_plan') {
        const rows = await getDb().select({ model: providerModels, provider: providers }).from(providerModels)
          .innerJoin(providers, eq(providerModels.providerId, providers.id)).where(eq(providerModels.isDefaultText, true)).limit(20);
        const selected = rows.find((row) => row.model.enabled && row.provider.enabled && modelCapabilitySchema.array().parse(row.model.capabilities).includes('structured_output'));
        if (!selected) throw new Error('No enabled structured-output text model');
        modelId = selected.model.id; providerId = selected.provider.id;
      }
      const [job] = await getDb().insert(generationJobs).values({ type, status: 'pending', modelId, providerId, input: { targetId } }).returning();
      try { await enqueueGenerationJob(job.id); }
      catch (error) {
        await getDb().update(generationJobs).set({ status: 'failed', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: error instanceof Error ? error.message : 'Queue unavailable', finishedAt: new Date() }).where(eq(generationJobs.id, job.id));
        throw error;
      }
    },
  });
}

function stateFailure(c: Parameters<typeof fail>[0], error: unknown) {
  if (error instanceof GovernanceStateError) return fail(c, error.code, error.message, error.code === 'NOT_FOUND' ? 404 : 409);
  throw error;
}

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

governanceRoutes.post('/runs', async (c) => {
  const parsed = commandInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid command', 400);
  try {
    const run = await service().createRun({ ...parsed.data, requestedBy: c.get('admin').sub, promptVersion: 'template-governance-v1' });
    return ok(c, run, 202);
  } catch (error) { return stateFailure(c, error); }
});

governanceRoutes.get('/rule-sets/active', async (c) => {
  const [rules] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  return rules ? ok(c, rules) : fail(c, 'NOT_FOUND', 'Active governance rules not found', 404);
});

governanceRoutes.put('/rule-sets/active', async (c) => {
  const parsed = governanceRuleSetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rules', 400);
  return ok(c, await service().updateRules({ rules: parsed.data, actorId: c.get('admin').sub }));
});

governanceRoutes.post('/change-sets/:id/approve', async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid approval', 400);
  try { return ok(c, await service().approve({ changeSetId: c.req.param('id'), reviewerId: c.get('admin').sub, ...parsed.data }), 202); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets', async (c) => {
  const parsed = changeSetInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid change set', 400);
  const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, parsed.data.runId)).limit(1);
  if (!run) return fail(c, 'NOT_FOUND', 'Agent run not found', 404);
  const proposals = await getDb().select().from(governanceProposals).where(inArray(governanceProposals.id, parsed.data.proposalIds));
  if (proposals.length !== parsed.data.proposalIds.length || proposals.some((proposal) => proposal.runId !== run.id)) return fail(c, 'INVALID_PROPOSAL_SCOPE', 'Proposals must belong to the run', 409);
  const result = await getDb().transaction(async (tx) => {
    const [changeSet] = await tx.insert(governanceChangeSets).values({ runId: run.id, scopeSnapshot: { mode: 'explicit', templateIds: proposals.map((proposal) => proposal.templateId), proposalIds: proposals.map((proposal) => proposal.id) }, ruleSetId: run.ruleSetId, ruleSetVersion: run.ruleSetVersion, idempotencyKey: parsed.data.idempotencyKey, status: proposals.some((proposal) => proposal.requiresApproval) ? 'awaiting_approval' : 'planned', summary: { total: proposals.length } }).returning();
    await tx.insert(governanceChangeSetItems).values(proposals.map((proposal) => ({ changeSetId: changeSet.id, proposalId: proposal.id, templateId: proposal.templateId, status: proposal.requiresApproval ? 'awaiting_approval' : 'pending' })));
    return changeSet;
  });
  return ok(c, result, 201);
});

governanceRoutes.post('/change-sets/:id/submit', async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid submission', 400);
  const result = await submit_for_approval({ changeSetId: c.req.param('id'), idempotencyKey: parsed.data.idempotencyKey });
  return result ? ok(c, result) : fail(c, 'INVALID_CHANGE_SET_STATE', 'Only planned change sets can be submitted', 409);
});

governanceRoutes.post('/change-sets/:id/reject', async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rejection', 400);
  try { return ok(c, await service().reject({ changeSetId: c.req.param('id'), reviewerId: c.get('admin').sub, note: parsed.data.note, idempotencyKey: parsed.data.idempotencyKey })); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets/:id/retry', async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid retry', 400);
  try { return ok(c, await service().retry({ changeSetId: c.req.param('id'), idempotencyKey: parsed.data.idempotencyKey }), 202); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets/:id/rollback', async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rollback', 400);
  try { return ok(c, await service().rollback({ changeSetId: c.req.param('id'), idempotencyKey: parsed.data.idempotencyKey }), 202); }
  catch (error) { return stateFailure(c, error); }
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
