import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { taxonomyDimensionSchema, taxonomySlugSchema } from '@promptix/shared';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { getDb } from '../db/client.js';
import { promptTemplates, taxonomyTerms, templateTaxonomyAssignments } from '../db/schema.js';
import { listTaxonomyTerms } from '../lib/taxonomy.js';
import { fail, ok } from '../lib/response.js';

const taxonomyInputSchema = z.object({
  dimension: taxonomyDimensionSchema,
  slug: taxonomySlugSchema,
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  aliases: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
});

function normalizeAliases(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function conflictFor(input: z.infer<typeof taxonomyInputSchema>, excludeId?: string) {
  const rows = await listTaxonomyTerms({ dimension: input.dimension, includeDisabled: true });
  const candidates = new Set([input.label, ...input.aliases].map((value) => value.toLocaleLowerCase('zh-CN')));
  return rows.find((row) => row.id !== excludeId &&
    [row.label, ...row.aliases].some((value) => candidates.has(value.toLocaleLowerCase('zh-CN'))));
}

async function withReferenceCounts(rows: Array<typeof taxonomyTerms.$inferSelect>) {
  const db = getDb();
  return Promise.all(rows.map(async (row) => {
    const [[assignmentCount], [outputCount]] = await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(templateTaxonomyAssignments)
        .where(eq(templateTaxonomyAssignments.termId, row.id)),
      db.select({ value: sql<number>`count(*)::int` }).from(promptTemplates)
        .where(eq(promptTemplates.outputTypeId, row.id)),
    ]);
    return { ...row, referenceCount: Number(assignmentCount?.value ?? 0) + Number(outputCount?.value ?? 0) };
  }));
}

export const publicTaxonomyRoutes = new Hono();
publicTaxonomyRoutes.get('/', async (c) => ok(c, { items: await listTaxonomyTerms() }));

export const adminTaxonomyRoutes = new Hono<AdminVars>();
adminTaxonomyRoutes.use('*', requireAdmin);

adminTaxonomyRoutes.get('/', async (c) => {
  const dimensionValue = c.req.query('dimension');
  const dimension = dimensionValue ? taxonomyDimensionSchema.safeParse(dimensionValue) : null;
  if (dimension && !dimension.success) return fail(c, 'INVALID_TAXONOMY_DIMENSION', 'Unknown taxonomy dimension', 400);
  const rows = await listTaxonomyTerms({
    dimension: dimension?.success ? dimension.data : undefined,
    includeDisabled: c.req.query('includeDisabled') === 'true',
  });
  return ok(c, { items: await withReferenceCounts(rows) });
});

adminTaxonomyRoutes.post('/', async (c) => {
  const parsed = taxonomyInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid taxonomy term', 400);
  const input = { ...parsed.data, aliases: normalizeAliases(parsed.data.aliases) };
  const duplicateSlug = await getDb().select({ id: taxonomyTerms.id }).from(taxonomyTerms)
    .where(and(eq(taxonomyTerms.dimension, input.dimension), eq(taxonomyTerms.slug, input.slug))).limit(1);
  if (duplicateSlug.length) return fail(c, 'TAXONOMY_SLUG_EXISTS', 'This slug already exists in the dimension', 409);
  if (await conflictFor(input)) return fail(c, 'TAXONOMY_ALIAS_CONFLICT', 'Label or alias conflicts with an existing term', 409);
  const [row] = await getDb().insert(taxonomyTerms).values({ ...input, createdBy: c.get('admin').sub }).returning();
  return ok(c, { ...row, referenceCount: 0 }, 201);
});

adminTaxonomyRoutes.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = taxonomyInputSchema.omit({ dimension: true, slug: true }).partial().safeParse(body);
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid taxonomy term', 400);
  const [existing] = await getDb().select().from(taxonomyTerms).where(eq(taxonomyTerms.id, c.req.param('id'))).limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Taxonomy term not found', 404);
  const next = {
    dimension: existing.dimension as z.infer<typeof taxonomyDimensionSchema>, slug: existing.slug,
    label: parsed.data.label ?? existing.label,
    description: parsed.data.description ?? existing.description,
    aliases: normalizeAliases(parsed.data.aliases ?? existing.aliases),
    sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
  };
  if (await conflictFor(next, existing.id)) return fail(c, 'TAXONOMY_ALIAS_CONFLICT', 'Label or alias conflicts with an existing term', 409);
  const [row] = await getDb().update(taxonomyTerms).set({
    label: next.label, description: next.description, aliases: next.aliases,
    sortOrder: next.sortOrder, updatedAt: new Date(),
  }).where(eq(taxonomyTerms.id, existing.id)).returning();
  return ok(c, row);
});

for (const [path, enabled] of [['enable', true], ['disable', false]] as const) {
  adminTaxonomyRoutes.post(`/:id/${path}`, async (c) => {
    const [row] = await getDb().update(taxonomyTerms).set({ enabled, updatedAt: new Date() })
      .where(eq(taxonomyTerms.id, c.req.param('id'))).returning();
    return row ? ok(c, row) : fail(c, 'NOT_FOUND', 'Taxonomy term not found', 404);
  });
}
