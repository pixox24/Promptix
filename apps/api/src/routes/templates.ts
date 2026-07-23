import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { classifyGovernanceRisk, governanceRuleSetSchema, modelCapabilitySchema, recommendationEventInputSchema, taxonomySlugSchema, templateDraftSchema, type TemplateVersionSnapshot } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { agentRuns, generationJobs, governanceAuditEvents, governanceChangeSetItems, governanceChangeSets, governanceProposals, governanceRuleSets, mediaObjects, promptTemplates, providerModels, providers, taxonomyTerms, templateAssets, templateTaxonomyAssignments, templateVersions } from '../db/schema.js';
import { requireAdmin, requireOwner, type AdminVars } from '../lib/auth.js';
import { deleteObject, putObject, storageKind } from '../lib/storage.js';
import { fail, ok } from '../lib/response.js';
import { enqueueGenerationJob } from '../lib/job-enqueue.js';
import { buildTemplateCoverRequest } from '../lib/template-cover.js';
import { loadTemplateSemanticViews, type TemplateSemanticView } from '../lib/template-semantics.js';
import { assertConfirmableSemantic, legacyCategoryForOutputType, resolveSemanticTerms, TaxonomyValidationError } from '../lib/taxonomy.js';
import { buildTemplateVersionSnapshot, recordInitialTemplateVersion, updateTemplateWithVersion } from '../lib/template-versioning.js';
import { getSimilarTemplateResponse } from '../services/similar-template-service.js';
import { recordClientRecommendationEvent } from '../services/recommendation-event-service.js';

const templateInput = templateDraftSchema.extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
  source: z.enum(['manual', 'image_reverse', 'text_expand']).default('manual'),
  sourceMeta: z.record(z.unknown()).optional(),
  locale: z.string().default('zh'),
  i18n: z.record(z.unknown()).optional(),
  isFeatured: z.boolean().default(false),
  featuredOrder: z.number().int().min(0).max(1_000_000).default(0),
  isHot: z.boolean().default(false),
  autoCover: z.boolean().default(false),
  coverMode: z.enum(['auto_if_missing', 'auto_preview', 'disabled']).default('disabled'),
  taxonomyConfirmed: z.boolean().default(false),
});

// PATCH must not apply the create-schema defaults to omitted fields. In particular,
// a name-only edit must not silently clear featured flags or review confirmation.
const templatePatchInput = templateDraftSchema.partial().extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
  source: z.enum(['manual', 'image_reverse', 'text_expand']).optional(),
  sourceMeta: z.record(z.unknown()).optional(),
  locale: z.string().optional(),
  i18n: z.record(z.unknown()).optional(),
  isFeatured: z.boolean().optional(),
  featuredOrder: z.number().int().min(0).max(1_000_000).optional(),
  isHot: z.boolean().optional(),
  autoCover: z.boolean().optional(),
  coverMode: z.enum(['auto_if_missing', 'auto_preview', 'disabled']).optional(),
  taxonomyConfirmed: z.boolean().optional(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const versionedActionInput = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

const deletionSelectionInput = z.object({
  templateIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100)
    .refine((values) => new Set(values).size === values.length, 'Template IDs must be unique'),
});
const deletionRequestInput = deletionSelectionInput.extend({
  idempotencyKey: z.string().trim().min(8).max(200),
});

function slug(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${normalized || 'template'}-${Date.now().toString(36)}`;
}

async function taxonomySnapshotViews(rows: Array<typeof promptTemplates.$inferSelect>) {
  const result = new Map<string, TemplateVersionSnapshot['taxonomyAssignments']>();
  if (!rows.length) return result;
  const templateIds = rows.map((row) => row.id);
  const outputTypeIds = rows.map((row) => row.outputTypeId).filter((id): id is string => Boolean(id));
  const [assignments, outputTerms] = await Promise.all([
    getDb().select({ templateId: templateTaxonomyAssignments.templateId, source: templateTaxonomyAssignments.source, confidence: templateTaxonomyAssignments.confidence, term: taxonomyTerms })
      .from(templateTaxonomyAssignments)
      .innerJoin(taxonomyTerms, eq(templateTaxonomyAssignments.termId, taxonomyTerms.id))
      .where(inArray(templateTaxonomyAssignments.templateId, templateIds)),
    outputTypeIds.length ? getDb().select().from(taxonomyTerms).where(inArray(taxonomyTerms.id, outputTypeIds)) : Promise.resolve([]),
  ]);
  const outputById = new Map(outputTerms.map((term) => [term.id, term]));
  for (const row of rows) {
    const output = row.outputTypeId ? outputById.get(row.outputTypeId) : null;
    result.set(row.id, [
      ...(output ? [{ termId: output.id, slug: output.slug, dimension: output.dimension, source: 'migration' as const, confidence: null }] : []),
      ...assignments.filter((assignment) => assignment.templateId === row.id).map((assignment) => ({
        termId: assignment.term.id,
        slug: assignment.term.slug,
        dimension: assignment.term.dimension,
        source: assignment.source,
        confidence: assignment.confidence == null ? null : Number(assignment.confidence),
      })),
    ] as TemplateVersionSnapshot['taxonomyAssignments']);
  }
  return result;
}

function publicShape(row: typeof promptTemplates.$inferSelect, semantic?: TemplateSemanticView) {
  return {
    id: row.id, name: row.name, summary: row.summary, description: row.description,
    coverImage: row.coverUrl ?? '', category: row.category, tags: row.tags,
    variables: row.variables, promptTemplate: row.promptTemplate,
    negativePrompt: row.negativePrompt, scenarios: row.scenarios,
    semantic,
    isFeatured: row.isFeatured, featuredOrder: row.featuredOrder, isHot: row.isHot,
    favoriteCount: row.favoriteCount, useCount: row.useCount,
    createdAt: row.createdAt.toISOString(), locale: row.locale,
  };
}

export const publicTemplateRoutes = new Hono();

function csvSlugs(value: string | undefined) {
  if (!value) return [];
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function taxonomyExists(dimension: 'scenario' | 'style' | 'subject', slugs: string[]) {
  return sql`exists (
    select 1 from ${templateTaxonomyAssignments}
    inner join ${taxonomyTerms} on ${templateTaxonomyAssignments.termId} = ${taxonomyTerms.id}
    where ${templateTaxonomyAssignments.templateId} = ${promptTemplates.id}
      and ${taxonomyTerms.dimension} = ${dimension}
      and ${taxonomyTerms.slug} in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)})
  )`;
}

publicTemplateRoutes.get('/', async (c) => {
  const db = getDb();
  const legacyCategory = c.req.query('category');
  const legacyOutputMap: Record<string, string> = { portrait:'portrait', ecommerce:'product_image', poster:'poster', logo:'logo', illustration:'illustration', edit:'general_visual' };
  if (legacyCategory && !Object.hasOwn(legacyOutputMap, legacyCategory)) return fail(c, 'INVALID_CATEGORY', 'Invalid legacy category', 400);
  const outputType = c.req.query('outputType') ?? (legacyCategory ? legacyOutputMap[legacyCategory] : undefined);
  const q = c.req.query('q')?.trim();
  const tag = c.req.query('tag');
  const scenarios = csvSlugs(c.req.query('scenarios') ?? c.req.query('scenario'));
  const styles = csvSlugs(c.req.query('styles'));
  const subjects = csvSlugs(c.req.query('subjects'));
  const allSlugs = [...(outputType ? [outputType] : []), ...scenarios, ...styles, ...subjects];
  if (allSlugs.some((slug) => !taxonomySlugSchema.safeParse(slug).success)) return fail(c, 'INVALID_TAXONOMY_FILTER', 'Invalid taxonomy filter', 400);
  const allowedSorts = new Set(['relevance', 'hot', 'featured', 'latest', 'favorites']);
  const requestedSort = c.req.query('sort') ?? (q ? 'relevance' : 'hot');
  if (!allowedSorts.has(requestedSort)) return fail(c, 'INVALID_SORT', 'Invalid sort option', 400);
  const sort = requestedSort === 'relevance' && !q ? 'hot' : requestedSort;
  const requestedPage = Number(c.req.query('page') ?? 1);
  const requestedPageSize = Number(c.req.query('pageSize') ?? 24);
  if (!Number.isInteger(requestedPage) || requestedPage < 1 || !Number.isInteger(requestedPageSize) || requestedPageSize < 1 || requestedPageSize > 100) {
    return fail(c, 'INVALID_PAGINATION', 'Pagination must use page >= 1 and pageSize between 1 and 100', 400);
  }
  const page = requestedPage;
  const pageSize = requestedPageSize;
  const filters = [eq(promptTemplates.status, 'published'), isNull(promptTemplates.deletedAt)];
  if (outputType) filters.push(sql`exists (select 1 from ${taxonomyTerms} where ${taxonomyTerms.id} = ${promptTemplates.outputTypeId} and ${taxonomyTerms.dimension} = 'output_type' and ${taxonomyTerms.slug} = ${outputType})`);
  if (scenarios.length) filters.push(taxonomyExists('scenario', scenarios));
  if (styles.length) filters.push(taxonomyExists('style', styles));
  if (subjects.length) filters.push(taxonomyExists('subject', subjects));
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  for (const token of tokens) {
    filters.push(or(
      ilike(promptTemplates.name, `%${token}%`),
      ilike(promptTemplates.summary, `%${token}%`),
      ilike(promptTemplates.description, `%${token}%`),
      ilike(promptTemplates.promptTemplate, `%${token}%`),
      sql`array_to_string(${promptTemplates.tags}, ' ') ilike ${`%${token}%`}`,
      sql`exists (
        select 1 from ${taxonomyTerms}
        where (
          ${taxonomyTerms.id} = ${promptTemplates.outputTypeId}
          or exists (
            select 1 from ${templateTaxonomyAssignments}
            where ${templateTaxonomyAssignments.templateId} = ${promptTemplates.id}
              and ${templateTaxonomyAssignments.termId} = ${taxonomyTerms.id}
          )
        ) and (${taxonomyTerms.label} ilike ${`%${token}%`} or array_to_string(${taxonomyTerms.aliases}, ' ') ilike ${`%${token}%`})
      )`,
    )!);
  }
  if (tag) filters.push(sql`${tag} = ANY(${promptTemplates.tags})`);
  const relevance = q ? sql<number>`(
    case when lower(${promptTemplates.name}) = lower(${q}) then 100 else 0 end +
    case when exists (select 1 from unnest(${promptTemplates.tags}) as tag where lower(tag) = lower(${q})) then 80 else 0 end +
    case when exists (
      select 1 from ${taxonomyTerms}
      where (${taxonomyTerms.id} = ${promptTemplates.outputTypeId} or exists (
        select 1 from ${templateTaxonomyAssignments}
        where ${templateTaxonomyAssignments.templateId} = ${promptTemplates.id}
          and ${templateTaxonomyAssignments.termId} = ${taxonomyTerms.id}
      )) and lower(${taxonomyTerms.label}) = lower(${q})
    ) then 80 else 0 end +
    case when ${promptTemplates.name} ilike ${`%${q}%`} then 60 else 0 end +
    case when ${promptTemplates.summary} ilike ${`%${q}%`} then 40 else 0 end +
    case when exists (
      select 1 from ${taxonomyTerms}
      where (${taxonomyTerms.id} = ${promptTemplates.outputTypeId} or exists (
        select 1 from ${templateTaxonomyAssignments}
        where ${templateTaxonomyAssignments.templateId} = ${promptTemplates.id}
          and ${templateTaxonomyAssignments.termId} = ${taxonomyTerms.id}
      )) and exists (select 1 from unnest(${taxonomyTerms.aliases}) as alias where lower(alias) = lower(${q}))
    ) then 35 else 0 end +
    case when ${promptTemplates.description} ilike ${`%${q}%`} then 20 else 0 end +
    case when ${promptTemplates.promptTemplate} ilike ${`%${q}%`} then 5 else 0 end
  )` : sql<number>`0`;
  const order = sort === 'relevance'
    ? [desc(relevance), desc(promptTemplates.useCount), desc(promptTemplates.createdAt), asc(promptTemplates.id)]
    : sort === 'featured'
    ? [desc(promptTemplates.isFeatured), asc(sql<number>`CASE WHEN ${promptTemplates.isFeatured} THEN ${promptTemplates.featuredOrder} ELSE 0 END`), desc(promptTemplates.useCount), desc(promptTemplates.createdAt), asc(promptTemplates.id)]
    : sort === 'latest'
      ? [desc(promptTemplates.createdAt), asc(promptTemplates.id)]
      : sort === 'favorites'
        ? [desc(promptTemplates.favoriteCount), desc(promptTemplates.createdAt), asc(promptTemplates.id)]
        : [desc(promptTemplates.useCount), desc(promptTemplates.createdAt), asc(promptTemplates.id)];
  const where = and(...filters);
  const [[totalRow], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(promptTemplates).where(where),
    db.select().from(promptTemplates).where(where).orderBy(...order)
      .limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const semantics = await loadTemplateSemanticViews(rows);
  return ok(c, { items: rows.map((row) => publicShape(row, semantics.get(row.id))), page, pageSize, total: Number(totalRow?.total ?? 0) });
});

publicTemplateRoutes.get('/:id/similar', async (c) => {
  const limit = Number(c.req.query('limit') ?? 4);
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) {
    return fail(c, 'INVALID_LIMIT', 'limit must be an integer between 1 and 12', 400);
  }
  const result = await getSimilarTemplateResponse(c.req.param('id'), limit);
  return result
    ? ok(c, result)
    : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

publicTemplateRoutes.post('/:id/recommendation-events', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = recommendationEventInputSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      c,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Invalid event',
      400,
    );
  }
  const result = await recordClientRecommendationEvent({
    sourceTemplateId: c.req.param('id'),
    ...parsed.data,
  });
  return result.ok
    ? ok(c, { recorded: result.recorded })
    : fail(c, 'RECOMMENDATION_REQUEST_INVALID', result.reason, 409);
});

publicTemplateRoutes.get('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates)
    .where(and(eq(promptTemplates.id, c.req.param('id')), eq(promptTemplates.status, 'published'), isNull(promptTemplates.deletedAt))).limit(1);
  if (!row) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  const semantics = await loadTemplateSemanticViews([row]);
  return ok(c, publicShape(row, semantics.get(row.id)));
});

export const adminTemplateRoutes = new Hono<AdminVars>();
adminTemplateRoutes.use('*', requireAdmin);

adminTemplateRoutes.get('/', async (c) => {
  const filters = [isNull(promptTemplates.deletedAt)];
  const status = c.req.query('status'); const category = c.req.query('category'); const q = c.req.query('q');
  const outputType = c.req.query('outputType');
  const featured = c.req.query('featured');
  if (status) filters.push(eq(promptTemplates.status, status));
  if (category) filters.push(eq(promptTemplates.category, category));
  if (outputType) {
    if (!taxonomySlugSchema.safeParse(outputType).success) return fail(c, 'INVALID_TAXONOMY_FILTER', 'Invalid output type', 400);
    filters.push(sql`exists (select 1 from ${taxonomyTerms} where ${taxonomyTerms.id} = ${promptTemplates.outputTypeId} and ${taxonomyTerms.dimension} = 'output_type' and ${taxonomyTerms.slug} = ${outputType})`);
  }
  if (featured === 'true' || featured === 'false') filters.push(eq(promptTemplates.isFeatured, featured === 'true'));
  if (q) filters.push(or(ilike(promptTemplates.name, `%${q}%`), ilike(promptTemplates.summary, `%${q}%`))!);
  const rows = await getDb().select().from(promptTemplates)
    .where(filters.length ? and(...filters) : undefined).orderBy(desc(promptTemplates.updatedAt));
  const semantics = await loadTemplateSemanticViews(rows);
  return ok(c, rows.map((row) => ({ ...row, semantic: semantics.get(row.id) })));
});

adminTemplateRoutes.post('/', async (c) => {
  const parsed = templateInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid template', 400);
  const admin = c.get('admin'); const d = parsed.data; const id = d.id ?? slug(d.name);
  try {
    const resolved = await resolveSemanticTerms(d.semantic);
    if (d.taxonomyConfirmed) assertConfirmableSemantic(resolved.semantic);
    const reviewStatus = d.taxonomyConfirmed ? 'reviewed'
      : resolved.semantic.unmappedTerms.length ? 'needs_attention' : 'pending';
    const scenarioLabels = resolved.assignments.filter((term) => term.dimension === 'scenario').map((term) => term.label);
    const row = await getDb().transaction(async (tx) => {
      const [created] = await tx.insert(promptTemplates).values({
        id, name:d.name, summary:d.summary, description:d.description,
        category:legacyCategoryForOutputType(resolved.semantic.outputType),
        workflowType:resolved.semantic.workflowType, outputTypeId:resolved.outputType?.id,
        tags:resolved.semantic.tags, scenarios:scenarioLabels,
        taxonomyReviewStatus:reviewStatus, unmappedTerms:resolved.semantic.unmappedTerms,
        classificationMeta:{ confidence: resolved.semantic.confidence },
        taxonomyReviewedAt:d.taxonomyConfirmed ? new Date() : null,
        taxonomyReviewedBy:d.taxonomyConfirmed ? admin.sub : null,
        variables:d.variables, promptTemplate:d.promptTemplate,
        negativePrompt:d.negativePrompt, source:d.source, sourceMeta:d.sourceMeta,
        locale:d.locale, i18n:d.i18n, isFeatured:d.isFeatured, featuredOrder:d.featuredOrder,
        isHot:d.isHot, createdBy:admin.sub,
      }).returning();
      if (resolved.assignments.length) {
        await tx.insert(templateTaxonomyAssignments).values(resolved.assignments.map((term) => ({
          templateId: created.id, termId: term.id, source: d.taxonomyConfirmed ? 'admin' : 'ai',
          confidence: term.dimension === 'scenario' ? resolved.semantic.confidence.scenarios?.toString()
            : term.dimension === 'style' ? resolved.semantic.confidence.styles?.toString()
              : resolved.semantic.confidence.subjects?.toString(),
        })));
      }
      const taxonomyAssignments: TemplateVersionSnapshot['taxonomyAssignments'] = [
        ...(resolved.outputType ? [{ termId: resolved.outputType.id, slug: resolved.outputType.slug, dimension: resolved.outputType.dimension, source: d.taxonomyConfirmed ? 'admin' as const : 'ai' as const, confidence: null }] : []),
        ...resolved.assignments.map((term) => ({ termId: term.id, slug: term.slug, dimension: term.dimension, source: d.taxonomyConfirmed ? 'admin' as const : 'ai' as const, confidence: null })),
      ] as TemplateVersionSnapshot['taxonomyAssignments'];
      await recordInitialTemplateVersion({
        insertVersion: async (version) => {
          await tx.insert(templateVersions).values({
            templateId: version.templateId,
            version: version.version,
            snapshot: version.snapshot,
            source: version.actor.source,
            actorId: version.actor.actorId,
          });
        },
      }, created, resolved.semantic, { source: 'admin', actorId: admin.sub }, taxonomyAssignments);
      return created;
    });
    let coverJob: typeof generationJobs.$inferSelect | null = null;
    if (d.autoCover && d.coverMode !== 'disabled') {
      const request = buildTemplateCoverRequest(row, d.source === 'image_reverse' ? 'image_reverse_auto_cover' : 'template_revision_cover');
      const [model] = await getDb().select({ model: providerModels, providerEnabled: providers.enabled }).from(providerModels).innerJoin(providers, eq(providerModels.providerId, providers.id)).where(and(eq(providerModels.isDefaultImage, true), eq(providerModels.enabled, true), eq(providers.enabled, true))).limit(1);
      if (model) {
        const [created] = await getDb().insert(generationJobs).values({ type: 'image_generate', status: 'pending', actorId: admin.sub, modelId: model.model.id, providerId: model.model.providerId, templateId: row.id, input: { ...request, n: 1, jobPurpose: d.source === 'image_reverse' ? 'image_reverse_auto_cover' : 'template_revision_cover' } }).returning();
        coverJob = created;
        try { await enqueueGenerationJob(created.id); } catch (error) { await getDb().update(generationJobs).set({ status: 'failed', errorMessage: error instanceof Error ? error.message : 'Queue unavailable', finishedAt: new Date() }).where(eq(generationJobs.id, created.id)); coverJob = { ...created, status: 'failed', errorMessage: error instanceof Error ? error.message : 'Queue unavailable' }; }
      }
    }
    const semantics = await loadTemplateSemanticViews([row]);
    const shaped = { ...row, semantic: semantics.get(row.id) };
    return ok(c, coverJob ? { ...shaped, coverJob } : shaped, 201);
  } catch (e) {
    if (e instanceof TaxonomyValidationError) return fail(c, e.code, e.message, 400);
    return fail(c, 'TEMPLATE_CREATE_FAILED', e instanceof Error ? e.message : 'Create failed', 409);
  }
});

adminTemplateRoutes.get('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
  if (!row) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  const [coverJob] = await getDb().select().from(generationJobs).where(and(eq(generationJobs.templateId, row.id), eq(generationJobs.type, 'image_generate'))).orderBy(desc(generationJobs.createdAt)).limit(1);
  const semantics = await loadTemplateSemanticViews([row]);
  const shaped = { ...row, semantic: semantics.get(row.id) };
  return ok(c, coverJob ? { ...shaped, coverJob } : shaped);
});

adminTemplateRoutes.patch('/:id', async (c) => {
  const parsed = templatePatchInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid template', 400);
  const { id: _ignored, autoCover: _autoCover, coverMode: _coverMode, taxonomyConfirmed, semantic, expectedVersion, idempotencyKey, ...d } = parsed.data;
  if (d.isFeatured === false) d.featuredOrder = 0;
  try {
    let resolved: Awaited<ReturnType<typeof resolveSemanticTerms>> | null = null;
    if (semantic) {
      resolved = await resolveSemanticTerms(semantic);
      if (taxonomyConfirmed) assertConfirmableSemantic(resolved.semantic);
    }
    const existingRows = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
    if (!existingRows[0]) return fail(c, 'NOT_FOUND', 'Template not found', 404);
    const existingSemantics = await loadTemplateSemanticViews(existingRows);
    const existingTaxonomy = await taxonomySnapshotViews(existingRows);
    const nextSemantic = resolved?.semantic ?? existingSemantics.get(c.req.param('id')) ?? null;
    const nextTaxonomy: TemplateVersionSnapshot['taxonomyAssignments'] = resolved
      ? [
        ...(resolved.outputType ? [{ termId: resolved.outputType.id, slug: resolved.outputType.slug, dimension: resolved.outputType.dimension, source: taxonomyConfirmed ? 'admin' as const : 'ai' as const, confidence: null }] : []),
        ...resolved.assignments.map((term) => ({ termId: term.id, slug: term.slug, dimension: term.dimension, source: taxonomyConfirmed ? 'admin' as const : 'ai' as const, confidence: null })),
      ] as TemplateVersionSnapshot['taxonomyAssignments']
      : existingTaxonomy.get(c.req.param('id')) ?? [];
    const mutation = await getDb().transaction(async (tx) => {
      const semanticPatch = resolved ? {
        category: legacyCategoryForOutputType(resolved.semantic.outputType),
        workflowType: resolved.semantic.workflowType,
        outputTypeId: resolved.outputType?.id ?? null,
        tags: resolved.semantic.tags,
        scenarios: resolved.assignments.filter((term) => term.dimension === 'scenario').map((term) => term.label),
        taxonomyReviewStatus: taxonomyConfirmed ? 'reviewed' as const
          : resolved.semantic.unmappedTerms.length ? 'needs_attention' as const : 'pending' as const,
        unmappedTerms: resolved.semantic.unmappedTerms,
        classificationMeta: { confidence: resolved.semantic.confidence },
        taxonomyReviewedAt: taxonomyConfirmed ? new Date() : null,
        taxonomyReviewedBy: taxonomyConfirmed ? c.get('admin').sub : null,
      } : {};
      return updateTemplateWithVersion<typeof promptTemplates.$inferSelect>({
        findIdempotentResult: async (key) => {
          const [event] = await tx.select({ payload: governanceAuditEvents.payload })
            .from(governanceAuditEvents)
            .where(and(
              eq(governanceAuditEvents.eventType, 'template.updated'),
              eq(governanceAuditEvents.targetId, c.req.param('id')),
              sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${key}`,
            )).limit(1);
          const payload = event?.payload as { result?: typeof promptTemplates.$inferSelect } | undefined;
          return payload?.result ?? null;
        },
        loadTemplate: async (id) => {
          const [current] = await tx.select().from(promptTemplates).where(and(eq(promptTemplates.id, id), isNull(promptTemplates.deletedAt))).limit(1);
          return current ?? null;
        },
        updateIfVersion: async (id, version, patch) => {
          const [updated] = await tx.update(promptTemplates).set({
            ...patch,
            currentVersion: sql`${promptTemplates.currentVersion} + 1`,
            updatedAt: new Date(),
          }).where(and(eq(promptTemplates.id, id), eq(promptTemplates.currentVersion, version), isNull(promptTemplates.deletedAt))).returning();
          return updated ?? null;
        },
        replaceSemantic: resolved ? async (templateId) => {
          await tx.delete(templateTaxonomyAssignments).where(eq(templateTaxonomyAssignments.templateId, templateId));
          if (resolved.assignments.length) {
            await tx.insert(templateTaxonomyAssignments).values(resolved.assignments.map((term) => ({
              templateId, termId: term.id, source: taxonomyConfirmed ? 'admin' : 'ai',
            })));
          }
        } : undefined,
        insertVersion: async (version) => {
          await tx.insert(templateVersions).values({
            templateId: version.templateId,
            version: version.version,
            snapshot: version.snapshot,
            source: version.actor.source,
            actorId: version.actor.actorId,
          });
        },
        recordIdempotentResult: async (key, result) => {
          await tx.insert(governanceAuditEvents).values({
            actorType: 'admin', actorId: c.get('admin').sub,
            eventType: 'template.updated', targetType: 'template', targetId: result.id,
            payload: { idempotencyKey: key, result },
          });
        },
      }, {
        id: c.req.param('id'), expectedVersion, idempotencyKey,
        patch: { ...d, ...semanticPatch }, semantic: nextSemantic, taxonomyAssignments: nextTaxonomy,
        actor: { source: 'admin', actorId: c.get('admin').sub },
      });
    });
    if (!mutation.ok) {
      return mutation.code === 'NOT_FOUND'
        ? fail(c, 'NOT_FOUND', 'Template not found', 404)
        : fail(c, 'VERSION_CONFLICT', `Template changed on the server (version ${mutation.currentVersion ?? 'unknown'})`, 409);
    }
    const row = mutation.template;
    const semantics = await loadTemplateSemanticViews([row]);
    return ok(c, { ...row, semantic: semantics.get(row.id) });
  } catch (error) {
    if (error instanceof TaxonomyValidationError) return fail(c, error.code, error.message, 400);
    throw error;
  }
});

async function createLifecycleApprovalBatch(input: {
  templates: Array<{ template: typeof promptTemplates.$inferSelect; semantic: TemplateSemanticView }>;
  action: 'publish' | 'archive' | 'delete';
  actorId: string;
  idempotencyKey: string;
}) {
  const db = getDb();
  const [active] = await db.select().from(governanceRuleSets).where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!active) throw new Error('No active governance rules');
  const templateRows = input.templates.map(({ template }) => template);
  const taxonomyAssignments = await taxonomySnapshotViews(templateRows);
  return db.transaction(async (tx) => {
    const [replay] = await tx.select({ changeSetId: governanceAuditEvents.changeSetId }).from(governanceAuditEvents)
      .where(and(eq(governanceAuditEvents.eventType, 'template.lifecycle_requested'), sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${input.idempotencyKey}`)).limit(1);
    if (replay?.changeSetId) return { changeSetId: replay.changeSetId, status: 'awaiting_approval' as const };
    const templateIds = templateRows.map((template) => template.id);
    const goal = templateIds.length === 1 ? `${input.action}:${templateIds[0]}` : `${input.action}:batch:${templateIds.length}`;
    const [run] = await tx.insert(agentRuns).values({ trigger: 'manual', goal, scope: { mode: 'explicit', templateIds, proposalIds: [] }, promptVersion: 'lifecycle-direct-v1', ruleSetId: active.id, ruleSetVersion: active.version, status: 'awaiting_approval', requestedBy: input.actorId }).returning();
    const rules = governanceRuleSetSchema.parse(active.rules);
    const decision = classifyGovernanceRisk({ action: input.action, changedFields: [], confidence: 1, batchSize: templateRows.length }, rules);
    const proposals = await tx.insert(governanceProposals).values(input.templates.map(({ template, semantic }) => ({
      runId: run.id,
      templateId: template.id,
      baseVersion: template.currentVersion,
      currentSnapshot: buildTemplateVersionSnapshot(template, semantic, taxonomyAssignments.get(template.id) ?? []),
      action: input.action,
      proposedPatch: {},
      reasonCodes: ['LIFECYCLE_REQUEST'],
      explanation: `管理员请求${input.action}模板`,
      confidence: '1',
      riskLevel: decision.riskLevel,
      requiresApproval: true,
      status: 'awaiting_approval',
    }))).returning();
    const proposalIds = proposals.map((proposal) => proposal.id);
    const [changeSet] = await tx.insert(governanceChangeSets).values({ runId: run.id, scopeSnapshot: { mode: 'explicit', templateIds, proposalIds }, ruleSetId: active.id, ruleSetVersion: active.version, idempotencyKey: input.idempotencyKey, executionMode: 'approval', status: 'awaiting_approval', summary: { total: proposals.length, automatic: 0, awaitingApproval: proposals.length, approved: 0, applied: 0, rejected: 0, conflicts: 0, skipped: 0, failed: 0, rolledBack: 0, deleted: 0 }, rollbackUntil: new Date(Date.now() + rules.rollbackHours * 60 * 60 * 1000) }).returning();
    await tx.insert(governanceChangeSetItems).values(proposals.map((proposal) => ({ changeSetId: changeSet.id, proposalId: proposal.id, templateId: proposal.templateId, status: 'awaiting_approval' })));
    await tx.insert(governanceAuditEvents).values(proposals.map((proposal) => ({ actorType: 'admin', actorId: input.actorId, eventType: 'template.lifecycle_requested', targetType: 'template', targetId: proposal.templateId, runId: run.id, changeSetId: changeSet.id, proposalId: proposal.id, payload: { idempotencyKey: input.idempotencyKey, action: input.action } })));
    return { changeSetId: changeSet.id, status: 'awaiting_approval' as const };
  });
}

async function createLifecycleApproval(input: {
  template: typeof promptTemplates.$inferSelect;
  action: 'publish' | 'archive' | 'delete';
  actorId: string;
  idempotencyKey: string;
  semantic: TemplateSemanticView;
}) {
  return createLifecycleApprovalBatch({
    templates: [{ template: input.template, semantic: input.semantic }],
    action: input.action,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
  });
}

adminTemplateRoutes.post('/deletion-requests/preview', requireOwner, async (c) => {
  const parsed = deletionSelectionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid deletion selection', 400);
  const rows = await getDb().select({ id: promptTemplates.id, name: promptTemplates.name, status: promptTemplates.status })
    .from(promptTemplates).where(and(inArray(promptTemplates.id, parsed.data.templateIds), isNull(promptTemplates.deletedAt)));
  if (rows.length !== parsed.data.templateIds.length) return fail(c, 'TEMPLATE_SCOPE_CHANGED', '部分模板不存在或已经删除，请刷新后重试', 409);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ok(c, { templates: parsed.data.templateIds.map((id) => byId.get(id)!), total: rows.length });
});

adminTemplateRoutes.post('/deletion-requests', requireOwner, async (c) => {
  const parsed = deletionRequestInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid deletion request', 400);
  const rows = await getDb().select().from(promptTemplates)
    .where(and(inArray(promptTemplates.id, parsed.data.templateIds), isNull(promptTemplates.deletedAt)));
  if (rows.length !== parsed.data.templateIds.length) return fail(c, 'TEMPLATE_SCOPE_CHANGED', '部分模板不存在或已经删除，请刷新后重试', 409);
  const [replay] = await getDb().select({ changeSetId: governanceAuditEvents.changeSetId }).from(governanceAuditEvents)
    .where(and(eq(governanceAuditEvents.eventType, 'template.lifecycle_requested'), sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${parsed.data.idempotencyKey}`)).limit(1);
  if (replay?.changeSetId) return ok(c, { changeSetId: replay.changeSetId, status: 'awaiting_approval' as const }, 202);
  const activeProposals = await getDb().select({ templateId: governanceProposals.templateId }).from(governanceProposals)
    .where(and(inArray(governanceProposals.templateId, parsed.data.templateIds), inArray(governanceProposals.status, ['planned', 'accepted', 'awaiting_approval', 'approved'])));
  if (activeProposals.length) return fail(c, 'ACTIVE_GOVERNANCE_WORK_EXISTS', '部分模板已有待处理的治理任务，请先处理现有任务', 409);
  const semantics = await loadTemplateSemanticViews(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result = await createLifecycleApprovalBatch({
    templates: parsed.data.templateIds.map((id) => ({ template: byId.get(id)!, semantic: semantics.get(id)! })),
    action: 'delete',
    actorId: c.get('admin').sub,
    idempotencyKey: parsed.data.idempotencyKey,
  });
  return ok(c, result, 202);
});

adminTemplateRoutes.delete('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
  if (!row) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  const body = await c.req.json().catch(() => ({}));
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : crypto.randomUUID();
  const semantics = await loadTemplateSemanticViews([row]);
  return ok(c, await createLifecycleApproval({ template: row, action: 'delete', actorId: c.get('admin').sub, idempotencyKey, semantic: semantics.get(row.id)! }), 202);
});

adminTemplateRoutes.post('/:id/publish', async (c) => {
  const action = versionedActionInput.safeParse(await c.req.json().catch(() => null));
  if (!action.success) return fail(c, 'VALIDATION_ERROR', 'expectedVersion and idempotencyKey are required', 400);
  const [existing] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  if (!existing.coverObjectKey || !existing.coverUrl) return fail(c, 'COVER_REQUIRED', 'A cover image is required before publishing', 409);
  if (existing.taxonomyReviewStatus !== 'reviewed') return fail(c, 'TAXONOMY_REVIEW_REQUIRED', '请先人工确认模板分类', 409);
  const semantics = await loadTemplateSemanticViews([existing]);
  const semantic = semantics.get(existing.id);
  if (!semantic) return fail(c, 'TAXONOMY_REVIEW_REQUIRED', '模板分类不可用', 409);
  try { assertConfirmableSemantic(semantic); } catch (error) {
    if (error instanceof TaxonomyValidationError) return fail(c, error.code, error.message, 409);
    throw error;
  }
  const assignedTerms = await getDb().select({ enabled: taxonomyTerms.enabled }).from(templateTaxonomyAssignments)
    .innerJoin(taxonomyTerms, eq(templateTaxonomyAssignments.termId, taxonomyTerms.id))
    .where(eq(templateTaxonomyAssignments.templateId, existing.id));
  const [outputTerm] = existing.outputTypeId
    ? await getDb().select({ enabled: taxonomyTerms.enabled }).from(taxonomyTerms).where(eq(taxonomyTerms.id, existing.outputTypeId)).limit(1)
    : [];
  if (!outputTerm?.enabled || assignedTerms.some((term) => !term.enabled)) {
    return fail(c, 'TAXONOMY_TERM_DISABLED', '模板使用了已停用的分类词', 409);
  }
  if (existing.currentVersion !== action.data.expectedVersion) return fail(c, 'VERSION_CONFLICT', 'Template changed on the server', 409);
  return ok(c, await createLifecycleApproval({ template: existing, action: 'publish', actorId: c.get('admin').sub, idempotencyKey: action.data.idempotencyKey, semantic }), 202);
});

adminTemplateRoutes.post('/:id/archive', async (c) => {
  const action = versionedActionInput.safeParse(await c.req.json().catch(() => null));
  if (!action.success) return fail(c, 'VALIDATION_ERROR', 'expectedVersion and idempotencyKey are required', 400);
  const [existing] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  if (existing.currentVersion !== action.data.expectedVersion) return fail(c, 'VERSION_CONFLICT', 'Template changed on the server', 409);
  const semantics = await loadTemplateSemanticViews([existing]);
  return ok(c, await createLifecycleApproval({ template: existing, action: 'archive', actorId: c.get('admin').sub, idempotencyKey: action.data.idempotencyKey, semantic: semantics.get(existing.id)! }), 202);
});

adminTemplateRoutes.post('/:id/cover', async (c) => {
  const [template] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, c.req.param('id')), isNull(promptTemplates.deletedAt))).limit(1);
  if (!template) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  const body = await c.req.parseBody(); const file = body.file;
  const expectedVersion = Number(body.expectedVersion);
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || idempotencyKey.length < 8) {
    return fail(c, 'VALIDATION_ERROR', 'expectedVersion and idempotencyKey are required', 400);
  }
  const [replayed] = await getDb().select({ payload: governanceAuditEvents.payload }).from(governanceAuditEvents)
    .where(and(
      eq(governanceAuditEvents.eventType, 'template.cover_updated'),
      eq(governanceAuditEvents.targetId, template.id),
      sql`${governanceAuditEvents.payload}->>'idempotencyKey' = ${idempotencyKey}`,
    )).limit(1);
  if (replayed) {
    const [current] = await getDb().select().from(promptTemplates).where(and(eq(promptTemplates.id, template.id), isNull(promptTemplates.deletedAt))).limit(1);
    return ok(c, current, 201);
  }
  if (!(file instanceof File)) return fail(c, 'FILE_REQUIRED', 'Image file is required', 400);
  if (!file.type.startsWith('image/')) return fail(c, 'INVALID_FILE_TYPE', 'Only image files are allowed', 415);
  if (file.size > 10 * 1024 * 1024) return fail(c, 'FILE_TOO_LARGE', 'Image must be at most 10MB', 413);
  const ext = file.type.split('/')[1]?.replace('jpeg','jpg') ?? 'bin';
  const key = `public/templates/${template.id}/cover-${Date.now()}.${ext}`;
  const stored = await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  const db = getDb();
  const semantics = await loadTemplateSemanticViews([template]);
  const taxonomyAssignments = (await taxonomySnapshotViews([template])).get(template.id) ?? [];
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(promptTemplates).set({
      coverObjectKey:key, coverUrl:stored.url,
      currentVersion: sql`${promptTemplates.currentVersion} + 1`, updatedAt:new Date(),
    }).where(and(eq(promptTemplates.id, template.id), eq(promptTemplates.currentVersion, expectedVersion), isNull(promptTemplates.deletedAt))).returning();
    if (!updated) return null;
    await tx.delete(templateAssets).where(and(eq(templateAssets.templateId, template.id), eq(templateAssets.kind, 'cover')));
    await tx.insert(templateAssets).values({ templateId:template.id, objectKey:key, url:stored.url, kind:'cover', bytes:file.size });
    await tx.insert(mediaObjects).values({ objectKey:key, bucket:storageKind(), url:stored.url, storageClass:'permanent', prefixKind:'template', ownerType:'template', ownerId:template.id, mime:file.type, bytes:file.size }).onConflictDoUpdate({ target:mediaObjects.objectKey, set:{ url:stored.url, bytes:file.size, mime:file.type, deletedAt:null } });
    await tx.insert(templateVersions).values({
      templateId: updated.id, version: updated.currentVersion,
      snapshot: buildTemplateVersionSnapshot(updated, semantics.get(updated.id) ?? null, taxonomyAssignments),
      source: 'admin', actorId: c.get('admin').sub,
    });
    await tx.insert(governanceAuditEvents).values({
      actorType: 'admin', actorId: c.get('admin').sub,
      eventType: 'template.cover_updated', targetType: 'template', targetId: updated.id,
      payload: { idempotencyKey, version: updated.currentVersion },
    });
    return updated;
  });
  if (!row) {
    await deleteObject(key);
    const [current] = await db.select({ currentVersion: promptTemplates.currentVersion }).from(promptTemplates).where(and(eq(promptTemplates.id, template.id), isNull(promptTemplates.deletedAt))).limit(1);
    return fail(c, 'VERSION_CONFLICT', `Template changed on the server (version ${current?.currentVersion ?? 'unknown'})`, 409);
  }
  if (template.coverObjectKey && template.coverObjectKey !== key) await deleteObject(template.coverObjectKey);
  return ok(c, row, 201);
});
