import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { governanceChangeSetSummarySchema, governanceRuleSetSchema, governanceSelectionScopeSchema, modelCapabilitySchema, type GovernanceQueueId } from '@promptix/shared';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { agentRuns, generationJobs, governanceApprovals, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets, providerModels, providers } from '../db/schema.js';
import { requireAdmin, requireOwner, type AdminVars } from '../lib/auth.js';
import { GovernanceQueryValidationError, parseGovernancePageQuery } from '../lib/governance-query.js';
import { inspect_template, search_templates, submit_for_approval, validate_template } from '../lib/governance-tools.js';
import { fail, ok } from '../lib/response.js';
import { createGovernanceRepository } from '../lib/governance-repository.js';
import { GovernanceService, GovernanceStateError } from '../lib/governance-service.js';
import { enqueueGenerationJob } from '../lib/job-enqueue.js';
import { governanceSchedulerStatus, registerGovernanceScheduler } from '../lib/governance-scheduler.js';
import { GovernancePreparationError, prepareGovernanceRun } from '../lib/governance-run-preparation.js';

const commandInput = z.object({
  goal: z.string().trim().min(1).max(2_000),
  scope: governanceSelectionScopeSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
});
const actionInput = z.object({ idempotencyKey: z.string().trim().min(8).max(200), note: z.string().max(2_000).default(''), deleteConfirmation: z.string().optional() });
const changeSetInput = z.object({ runId: z.string().uuid(), proposalIds: z.array(z.string().uuid()).min(1).max(1_000), idempotencyKey: z.string().trim().min(8).max(200) });
const runListInput = z.object({
  status: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const agentConfigInput = z.object({
  modelId: z.string().uuid().nullable(),
  promptVersion: z.string().trim().min(1).max(120),
  systemPrompt: z.string().max(20_000),
});

function service() {
  return new GovernanceService(createGovernanceRepository(), {
    enqueue: async ({ type, targetId }) => {
      let modelId: string | undefined; let providerId: string | undefined;
      if (type === 'template_governance_plan') {
        let prepared;
        try { prepared = await prepareGovernanceRun(targetId); }
        catch (error) {
          if (error instanceof GovernancePreparationError) throw new GovernanceStateError(error.code, error.message);
          throw error;
        }
        modelId = prepared.model.id; providerId = prepared.provider.id;
        const [job] = await getDb().insert(generationJobs).values({ type, status: 'pending', actorId: prepared.run.requestedBy, modelId, providerId, input: prepared.input }).returning();
        await getDb().update(agentRuns).set({ status: 'analyzing', modelId, startedAt: new Date(), errorCode: null, errorMessage: null }).where(eq(agentRuns.id, prepared.run.id));
        try { await enqueueGenerationJob(job.id); }
        catch (error) { await getDb().update(generationJobs).set({ status: 'failed', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: error instanceof Error ? error.message : 'Queue unavailable', finishedAt: new Date() }).where(eq(generationJobs.id, job.id)); throw error; }
        return;
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
    const run = await service().createRun({ ...parsed.data, requestedBy: c.get('admin').sub });
    return ok(c, run, 202);
  } catch (error) { return stateFailure(c, error); }
});

governanceRoutes.get('/rule-sets/active', async (c) => {
  const [rules] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  return rules ? ok(c, { ...rules, scheduler: governanceSchedulerStatus() }) : fail(c, 'NOT_FOUND', 'Active governance rules not found', 404);
});

governanceRoutes.put('/rule-sets/active', requireOwner, async (c) => {
  const parsed = governanceRuleSetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rules', 400);
  const rules = await service().updateRules({ rules: parsed.data, actorId: c.get('admin').sub });
  const scheduler = await registerGovernanceScheduler();
  return ok(c, { ...rules, scheduler });
});

governanceRoutes.get('/agent-config', async (c) => {
  const [rules] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!rules) return fail(c, 'NOT_FOUND', 'Active governance rules not found', 404);
  const models = await getDb().select({ id: providerModels.id, name: providerModels.name, modelId: providerModels.modelId, capabilities: providerModels.capabilities, providerId: providerModels.providerId })
    .from(providerModels).innerJoin(providers, eq(providerModels.providerId, providers.id)).where(and(eq(providerModels.enabled, true), eq(providers.enabled, true)));
  return ok(c, {
    config: governanceRuleSetSchema.parse(rules.rules).agent,
    defaultPromptVersion: 'template-governance-v1',
    models: models.filter((model) => modelCapabilitySchema.array().safeParse(model.capabilities).success && modelCapabilitySchema.array().parse(model.capabilities).includes('text') && modelCapabilitySchema.array().parse(model.capabilities).includes('structured_output')),
  });
});

governanceRoutes.put('/agent-config', requireOwner, async (c) => {
  const parsed = agentConfigInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid Agent config', 400);
  const [active] = await getDb().select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!active) return fail(c, 'NOT_FOUND', 'Active governance rules not found', 404);
  if (parsed.data.modelId) {
    const [selected] = await getDb().select({ model: providerModels, providerEnabled: providers.enabled }).from(providerModels).innerJoin(providers, eq(providerModels.providerId, providers.id)).where(eq(providerModels.id, parsed.data.modelId)).limit(1);
    const capabilities = selected ? modelCapabilitySchema.array().safeParse(selected.model.capabilities) : null;
    if (!selected || !selected.model.enabled || !selected.providerEnabled || !capabilities?.success || !capabilities.data.includes('text') || !capabilities.data.includes('structured_output')) return fail(c, 'MODEL_NOT_CONFIGURED', '请选择已启用且支持结构化输出的文本模型', 409);
  }
  const current = governanceRuleSetSchema.parse(active.rules);
  const saved = await service().updateRules({ rules: { ...current, agent: parsed.data }, actorId: c.get('admin').sub });
  const scheduler = await registerGovernanceScheduler();
  return ok(c, { config: saved.rules.agent, version: saved.version, scheduler });
});

governanceRoutes.post('/change-sets/:id/approve', requireOwner, async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid approval', 400);
  try { return ok(c, await service().approve({ changeSetId: c.req.param('id')!, reviewerId: c.get('admin').sub, ...parsed.data }), 202); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets', async (c) => {
  const parsed = changeSetInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid change set', 400);
  const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, parsed.data.runId)).limit(1);
  if (!run) return fail(c, 'NOT_FOUND', 'Agent run not found', 404);
  const proposals = await getDb().select().from(governanceProposals).where(inArray(governanceProposals.id, parsed.data.proposalIds));
  if (proposals.length !== parsed.data.proposalIds.length || proposals.some((proposal) => proposal.runId !== run.id)) return fail(c, 'INVALID_PROPOSAL_SCOPE', 'Proposals must belong to the run', 409);
  const requiresApproval = new Set(proposals.map((proposal) => proposal.requiresApproval));
  if (requiresApproval.size > 1) return fail(c, 'MIXED_CHANGE_SET_NOT_ALLOWED', 'Automatic and approval proposals must use separate change sets', 409);
  const existingItems = await getDb().select({ proposalId: governanceChangeSetItems.proposalId }).from(governanceChangeSetItems).where(inArray(governanceChangeSetItems.proposalId, parsed.data.proposalIds));
  if (existingItems.length) return fail(c, 'PROPOSAL_ALREADY_ASSIGNED', 'A proposal can belong to only one change set', 409);
  const executionMode = proposals[0]!.requiresApproval ? 'approval' : 'automatic';
  const result = await getDb().transaction(async (tx) => {
    const [changeSet] = await tx.insert(governanceChangeSets).values({ runId: run.id, scopeSnapshot: { mode: 'explicit', templateIds: proposals.map((proposal) => proposal.templateId), proposalIds: proposals.map((proposal) => proposal.id) }, ruleSetId: run.ruleSetId, ruleSetVersion: run.ruleSetVersion, idempotencyKey: parsed.data.idempotencyKey, executionMode, status: executionMode === 'approval' ? 'awaiting_approval' : 'planned', summary: governanceChangeSetSummarySchema.parse({ total: proposals.length, automatic: executionMode === 'automatic' ? proposals.length : 0, awaitingApproval: executionMode === 'approval' ? proposals.length : 0 }) }).returning();
    await tx.insert(governanceChangeSetItems).values(proposals.map((proposal) => ({ changeSetId: changeSet.id, proposalId: proposal.id, templateId: proposal.templateId, status: proposal.requiresApproval ? 'awaiting_approval' : 'pending' })));
    await tx.insert(governanceAuditEvents).values({ actorType: 'admin', actorId: c.get('admin').sub, eventType: 'governance.change_set_created', targetType: 'change_set', targetId: changeSet.id, runId: run.id, changeSetId: changeSet.id, payload: { proposalIds: proposals.map((proposal) => proposal.id), idempotencyKey: parsed.data.idempotencyKey } });
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

governanceRoutes.post('/change-sets/:id/reject', requireOwner, async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rejection', 400);
  try { return ok(c, await service().reject({ changeSetId: c.req.param('id')!, reviewerId: c.get('admin').sub, note: parsed.data.note, idempotencyKey: parsed.data.idempotencyKey })); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets/:id/retry', requireOwner, async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid retry', 400);
  try { return ok(c, await service().retry({ changeSetId: c.req.param('id')!, idempotencyKey: parsed.data.idempotencyKey }), 202); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.post('/change-sets/:id/rollback', requireOwner, async (c) => {
  const parsed = actionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid rollback', 400);
  try { return ok(c, await service().rollback({ changeSetId: c.req.param('id')!, idempotencyKey: parsed.data.idempotencyKey }), 202); }
  catch (error) { return stateFailure(c, error); }
});

governanceRoutes.get('/runs', async (c) => {
  const parsed = runListInput.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid run query', 400);
  const rows = await getDb().select({ run: agentRuns, modelName: providerModels.name, modelIdentifier: providerModels.modelId })
    .from(agentRuns).leftJoin(providerModels, eq(agentRuns.modelId, providerModels.id))
    .where(parsed.data.status ? eq(agentRuns.status, parsed.data.status) : undefined)
    .orderBy(desc(agentRuns.createdAt)).limit(parsed.data.limit);
  return ok(c, { items: rows.map(({ run, modelName, modelIdentifier }) => ({ ...run, model: run.modelId ? { id: run.modelId, name: modelName, modelId: modelIdentifier } : null })) });
});

governanceRoutes.get('/runs/stats', async (c) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [summary] = await getDb().select({
    total: sql<number>`count(*)::int`,
    succeeded: sql<number>`count(*) filter (where ${agentRuns.status} = 'succeeded')::int`,
    failed: sql<number>`count(*) filter (where ${agentRuns.status} = 'failed')::int`,
    awaitingApproval: sql<number>`count(*) filter (where ${agentRuns.status} = 'awaiting_approval')::int`,
    partiallySucceeded: sql<number>`count(*) filter (where ${agentRuns.status} = 'partially_succeeded')::int`,
    avgDurationMs: sql<number>`coalesce(avg(extract(epoch from (${agentRuns.finishedAt} - ${agentRuns.startedAt})) * 1000) filter (where ${agentRuns.finishedAt} is not null and ${agentRuns.startedAt} is not null), 0)::int`,
  }).from(agentRuns).where(sql`${agentRuns.createdAt} >= ${since}`);
  const [audit] = await getDb().select({
    applied: sql<number>`count(*) filter (where ${governanceAuditEvents.eventType} = 'governance.template_applied')::int`,
    rolledBack: sql<number>`count(*) filter (where ${governanceAuditEvents.eventType} = 'governance.template_rolled_back')::int`,
    deleted: sql<number>`count(*) filter (where ${governanceAuditEvents.eventType} = 'governance.template_deleted')::int`,
  }).from(governanceAuditEvents).where(sql`${governanceAuditEvents.createdAt} >= ${since}`);
  return ok(c, { windowDays: 30, ...summary, ...audit, successRate: summary.total ? Math.round((summary.succeeded / summary.total) * 100) : 0 });
});

governanceRoutes.get('/runs/:id', async (c) => {
  const [run] = await getDb().select().from(agentRuns).where(eq(agentRuns.id, c.req.param('id'))).limit(1);
  if (!run) return fail(c, 'NOT_FOUND', 'Agent run not found', 404);
  const [proposals, changeSets, jobs, models, audits] = await Promise.all([
    getDb().select().from(governanceProposals).where(eq(governanceProposals.runId, run.id)).orderBy(desc(governanceProposals.createdAt)),
    getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.runId, run.id)).orderBy(desc(governanceChangeSets.createdAt)),
    getDb().select().from(generationJobs).where(sql`${generationJobs.input}->>'targetId' = ${run.id}`).orderBy(desc(generationJobs.createdAt)).limit(1),
    run.modelId ? getDb().select().from(providerModels).where(eq(providerModels.id, run.modelId)).limit(1) : Promise.resolve([]),
    getDb().select().from(governanceAuditEvents).where(eq(governanceAuditEvents.runId, run.id)).orderBy(desc(governanceAuditEvents.createdAt)),
  ]);
  const jobInput = (jobs[0]?.input ?? {}) as Record<string, unknown>;
  const snapshots = Array.isArray(jobInput.snapshots) ? jobInput.snapshots : [];
  const signals = Array.isArray(jobInput.signals) ? jobInput.signals : [];
  return ok(c, {
    ...run,
    model: models[0] ? { id: models[0].id, name: models[0].name, modelId: models[0].modelId } : null,
    requestPreview: {
      goal: run.goal,
      promptVersion: run.promptVersion,
      ruleSetVersion: run.ruleSetVersion,
      templateCount: snapshots.length,
      signalCount: signals.length,
      templateIds: snapshots.slice(0, 100).map((value) => typeof value === 'object' && value ? String((value as { templateId?: unknown }).templateId ?? '') : '').filter(Boolean),
    },
    job: jobs[0] ? { id: jobs[0].id, status: jobs[0].status, errorCode: jobs[0].errorCode, errorMessage: jobs[0].errorMessage, createdAt: jobs[0].createdAt, startedAt: jobs[0].startedAt, finishedAt: jobs[0].finishedAt } : null,
    proposals,
    changeSets,
    audits,
  });
});

governanceRoutes.get('/change-sets/:id', async (c) => {
  const [changeSet] = await getDb().select().from(governanceChangeSets).where(eq(governanceChangeSets.id, c.req.param('id'))).limit(1);
  if (!changeSet) return fail(c, 'NOT_FOUND', 'Change set not found', 404);
  const [items, approvals, audits] = await Promise.all([
    getDb().select().from(governanceChangeSetItems).where(eq(governanceChangeSetItems.changeSetId, changeSet.id)),
    getDb().select().from(governanceApprovals).where(eq(governanceApprovals.changeSetId, changeSet.id)).orderBy(desc(governanceApprovals.createdAt)),
    getDb().select().from(governanceAuditEvents).where(eq(governanceAuditEvents.changeSetId, changeSet.id)).orderBy(desc(governanceAuditEvents.createdAt)),
  ]);
  return ok(c, { ...changeSet, items, approvals, audits });
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
