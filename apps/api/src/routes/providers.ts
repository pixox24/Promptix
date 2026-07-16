import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { providerKindSchema, providerProtocolSchema } from '@promptix/shared';
import { getDb } from '../db/client.js';
import { providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';

const providerInput = z.object({
  name:z.string().min(1), kind:providerKindSchema, protocol:providerProtocolSchema,
  baseUrl:z.string().url(), apiKeyEnv:z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional().nullable(),
  defaultModel:z.string().min(1), defaults:z.record(z.unknown()).default({}),
  authStyle:z.enum(['bearer','header']).default('bearer'), isDefault:z.boolean().default(false), enabled:z.boolean().default(true),
});

function safeProvider(p: typeof providers.$inferSelect) {
  const { apiKeyEncrypted: _secret, ...safe } = p;
  return { ...safe, apiKeyConfigured:Boolean(p.apiKeyEnv && process.env[p.apiKeyEnv]) };
}

export const providerRoutes = new Hono<AdminVars>();
providerRoutes.use('*', requireAdmin);
providerRoutes.get('/', async (c) => ok(c, (await getDb().select().from(providers).orderBy(desc(providers.updatedAt))).map(safeProvider)));
providerRoutes.post('/', async (c) => {
  const parsed=providerInput.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message ?? 'Invalid provider',400);
  const db=getDb();
  if(parsed.data.isDefault) await db.update(providers).set({isDefault:false}).where(eq(providers.kind,parsed.data.kind));
  const [row]=await db.insert(providers).values(parsed.data).returning();
  return ok(c,safeProvider(row),201);
});
providerRoutes.patch('/:id', async (c) => {
  const parsed=providerInput.partial().safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success) return fail(c,'VALIDATION_ERROR',parsed.error.issues[0]?.message ?? 'Invalid provider',400);
  const db=getDb();
  if(parsed.data.isDefault) await db.update(providers).set({isDefault:false}).where(eq(providers.kind, parsed.data.kind ?? 'llm'));
  const [row]=await db.update(providers).set({...parsed.data,updatedAt:new Date()}).where(eq(providers.id,c.req.param('id'))).returning();
  return row?ok(c,safeProvider(row)):fail(c,'NOT_FOUND','Provider not found',404);
});
providerRoutes.delete('/:id', async (c) => {
  const [row]=await getDb().delete(providers).where(eq(providers.id,c.req.param('id'))).returning();
  return row?ok(c,{ok:true}):fail(c,'NOT_FOUND','Provider not found',404);
});
