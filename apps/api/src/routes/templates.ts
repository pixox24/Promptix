import { Hono } from 'hono';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { templateDraftSchema } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { mediaObjects, promptTemplates, templateAssets } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { deleteObject, putObject, storageKind } from '../lib/storage.js';
import { fail, ok } from '../lib/response.js';

const templateInput = templateDraftSchema.extend({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
  source: z.enum(['manual', 'image_reverse', 'text_expand']).default('manual'),
  sourceMeta: z.record(z.unknown()).optional(),
  locale: z.string().default('zh'),
  i18n: z.record(z.unknown()).optional(),
  isFeatured: z.boolean().default(false),
  isHot: z.boolean().default(false),
});

function slug(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${normalized || 'template'}-${Date.now().toString(36)}`;
}

function publicShape(row: typeof promptTemplates.$inferSelect) {
  return {
    id: row.id, name: row.name, summary: row.summary, description: row.description,
    coverImage: row.coverUrl ?? '', category: row.category, tags: row.tags,
    variables: row.variables, promptTemplate: row.promptTemplate,
    negativePrompt: row.negativePrompt, scenarios: row.scenarios,
    isFeatured: row.isFeatured, isHot: row.isHot,
    favoriteCount: row.favoriteCount, useCount: row.useCount,
    createdAt: row.createdAt.toISOString(), locale: row.locale,
  };
}

export const publicTemplateRoutes = new Hono();

publicTemplateRoutes.get('/', async (c) => {
  const db = getDb();
  const category = c.req.query('category');
  const q = c.req.query('q');
  const tag = c.req.query('tag');
  const sort = c.req.query('sort') ?? 'hot';
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? 50)));
  const filters = [eq(promptTemplates.status, 'published')];
  if (category) filters.push(eq(promptTemplates.category, category));
  if (q) filters.push(or(ilike(promptTemplates.name, `%${q}%`), ilike(promptTemplates.summary, `%${q}%`))!);
  if (tag) filters.push(sql`${tag} = ANY(${promptTemplates.tags})`);
  const order = sort === 'latest' ? desc(promptTemplates.createdAt) :
    sort === 'favorites' ? desc(promptTemplates.favoriteCount) : desc(promptTemplates.useCount);
  const rows = await db.select().from(promptTemplates).where(and(...filters)).orderBy(order)
    .limit(pageSize).offset((page - 1) * pageSize);
  return ok(c, { items: rows.map(publicShape), page, pageSize });
});

publicTemplateRoutes.get('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates)
    .where(and(eq(promptTemplates.id, c.req.param('id')), eq(promptTemplates.status, 'published'))).limit(1);
  return row ? ok(c, publicShape(row)) : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

export const adminTemplateRoutes = new Hono<AdminVars>();
adminTemplateRoutes.use('*', requireAdmin);

adminTemplateRoutes.get('/', async (c) => {
  const filters = [];
  const status = c.req.query('status'); const category = c.req.query('category'); const q = c.req.query('q');
  if (status) filters.push(eq(promptTemplates.status, status));
  if (category) filters.push(eq(promptTemplates.category, category));
  if (q) filters.push(or(ilike(promptTemplates.name, `%${q}%`), ilike(promptTemplates.summary, `%${q}%`))!);
  const rows = await getDb().select().from(promptTemplates)
    .where(filters.length ? and(...filters) : undefined).orderBy(desc(promptTemplates.updatedAt));
  return ok(c, rows);
});

adminTemplateRoutes.post('/', async (c) => {
  const parsed = templateInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid template', 400);
  const admin = c.get('admin'); const d = parsed.data; const id = d.id ?? slug(d.name);
  try {
    const [row] = await getDb().insert(promptTemplates).values({
      id, name:d.name, summary:d.summary, description:d.description, category:d.category,
      tags:d.tags, scenarios:d.scenarios, variables:d.variables, promptTemplate:d.promptTemplate,
      negativePrompt:d.negativePrompt, source:d.source, sourceMeta:d.sourceMeta,
      locale:d.locale, i18n:d.i18n, isFeatured:d.isFeatured, isHot:d.isHot, createdBy:admin.sub,
    }).returning();
    return ok(c, row, 201);
  } catch (e) { return fail(c, 'TEMPLATE_CREATE_FAILED', e instanceof Error ? e.message : 'Create failed', 409); }
});

adminTemplateRoutes.get('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates).where(eq(promptTemplates.id, c.req.param('id'))).limit(1);
  return row ? ok(c, row) : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

adminTemplateRoutes.patch('/:id', async (c) => {
  const parsed = templateInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid template', 400);
  const { id: _ignored, ...d } = parsed.data;
  const [row] = await getDb().update(promptTemplates).set({ ...d, updatedAt:new Date() })
    .where(eq(promptTemplates.id, c.req.param('id'))).returning();
  return row ? ok(c, row) : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

adminTemplateRoutes.delete('/:id', async (c) => {
  const [row] = await getDb().select().from(promptTemplates).where(eq(promptTemplates.id, c.req.param('id'))).limit(1);
  if (!row) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  if (row.status === 'published') return fail(c, 'ARCHIVE_FIRST', 'Archive a published template before deleting it', 409);
  if (row.coverObjectKey) await deleteObject(row.coverObjectKey);
  await getDb().delete(promptTemplates).where(eq(promptTemplates.id, row.id));
  return ok(c, { ok:true });
});

adminTemplateRoutes.post('/:id/publish', async (c) => {
  const [existing] = await getDb().select().from(promptTemplates).where(eq(promptTemplates.id, c.req.param('id'))).limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  if (!existing.coverObjectKey || !existing.coverUrl) return fail(c, 'COVER_REQUIRED', 'A cover image is required before publishing', 409);
  const [row] = await getDb().update(promptTemplates).set({ status:'published', publishedAt:new Date(), updatedAt:new Date() })
    .where(eq(promptTemplates.id, existing.id)).returning();
  return ok(c, row);
});

adminTemplateRoutes.post('/:id/archive', async (c) => {
  const [row] = await getDb().update(promptTemplates).set({ status:'archived', updatedAt:new Date() })
    .where(eq(promptTemplates.id, c.req.param('id'))).returning();
  return row ? ok(c, row) : fail(c, 'NOT_FOUND', 'Template not found', 404);
});

adminTemplateRoutes.post('/:id/cover', async (c) => {
  const [template] = await getDb().select().from(promptTemplates).where(eq(promptTemplates.id, c.req.param('id'))).limit(1);
  if (!template) return fail(c, 'NOT_FOUND', 'Template not found', 404);
  const body = await c.req.parseBody(); const file = body.file;
  if (!(file instanceof File)) return fail(c, 'FILE_REQUIRED', 'Image file is required', 400);
  if (!file.type.startsWith('image/')) return fail(c, 'INVALID_FILE_TYPE', 'Only image files are allowed', 415);
  if (file.size > 10 * 1024 * 1024) return fail(c, 'FILE_TOO_LARGE', 'Image must be at most 10MB', 413);
  const ext = file.type.split('/')[1]?.replace('jpeg','jpg') ?? 'bin';
  const key = `public/templates/${template.id}/cover.${ext}`;
  const stored = await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  if (template.coverObjectKey && template.coverObjectKey !== key) await deleteObject(template.coverObjectKey);
  const db = getDb();
  await db.delete(templateAssets).where(and(eq(templateAssets.templateId, template.id), eq(templateAssets.kind, 'cover')));
  await db.insert(templateAssets).values({ templateId:template.id, objectKey:key, url:stored.url, kind:'cover', bytes:file.size });
  await db.insert(mediaObjects).values({ objectKey:key, bucket:storageKind(), url:stored.url, storageClass:'permanent', prefixKind:'template', ownerType:'template', ownerId:template.id, mime:file.type, bytes:file.size }).onConflictDoUpdate({ target:mediaObjects.objectKey, set:{ url:stored.url, bytes:file.size, mime:file.type, deletedAt:null } });
  const [row] = await db.update(promptTemplates).set({ coverObjectKey:key, coverUrl:stored.url, updatedAt:new Date() }).where(eq(promptTemplates.id, template.id)).returning();
  return ok(c, row, 201);
});
