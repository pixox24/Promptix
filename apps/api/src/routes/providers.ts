import { Hono } from 'hono';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  modelCapabilitySchema,
  providerAdapterCapabilityError,
  providerAdapterSchema,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { providerModels, providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';

const providerInput = z.object({
  name: z.string().trim().min(1).max(120),
  adapterType: providerAdapterSchema,
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional().nullable(),
  authStyle: z.enum(['bearer', 'header']).default('bearer'),
  enabled: z.boolean().default(true),
});

function legacyProtocol(adapterType: z.infer<typeof providerAdapterSchema>) {
  switch (adapterType) {
    case 'deepseek': return 'deepseek_chat';
    case 'custom_65535_async': return 'openai_images_async';
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'openai_compatible':
      return 'openai_chat';
  }
}

function safeProvider(p: typeof providers.$inferSelect) {
  const { apiKeyEncrypted: _secret, ...safe } = p;
  return {
    ...safe,
    apiKeyConfigured: Boolean(p.apiKeyEnv && process.env[p.apiKeyEnv]),
  };
}

async function providerHasDefaultModel(providerId: string) {
  const [model] = await getDb().select({ id: providerModels.id })
    .from(providerModels)
    .where(and(
      eq(providerModels.providerId, providerId),
      or(
        eq(providerModels.isDefaultText, true),
        eq(providerModels.isDefaultVision, true),
        eq(providerModels.isDefaultImage, true),
      ),
    ))
    .limit(1);
  return Boolean(model);
}

export const providerRoutes = new Hono<AdminVars>();
providerRoutes.use('*', requireAdmin);

providerRoutes.get('/', async (c) => {
  const rows = await getDb().select().from(providers).orderBy(desc(providers.updatedAt));
  return ok(c, rows.map(safeProvider));
});

providerRoutes.post('/', async (c) => {
  const parsed = providerInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const [row] = await getDb().insert(providers).values({
    ...parsed.data,
    kind: 'llm',
    protocol: legacyProtocol(parsed.data.adapterType),
    defaultModel: '',
    defaults: {},
    isDefault: false,
  }).returning();
  return ok(c, safeProvider(row), 201);
});

providerRoutes.patch('/:id', async (c) => {
  const parsed = providerInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const providerId = c.req.param('id');
  if (parsed.data.enabled === false && await providerHasDefaultModel(providerId)) {
    return fail(c, 'DEFAULT_PROVIDER_DISABLE_FORBIDDEN', 'Reassign default roles before disabling this provider', 409);
  }
  if (parsed.data.adapterType) {
    const models = await getDb().select({
      capabilities: providerModels.capabilities,
    }).from(providerModels).where(eq(providerModels.providerId, providerId));
    const incompatible = models.find((model) => providerAdapterCapabilityError(
      parsed.data.adapterType!,
      modelCapabilitySchema.array().parse(model.capabilities),
    ));
    if (incompatible) {
      return fail(c, 'PROVIDER_ADAPTER_INCOMPATIBLE', 'Existing model capabilities are incompatible with the requested adapter', 409);
    }
  }
  const values = {
    ...parsed.data,
    ...(parsed.data.adapterType
      ? { protocol: legacyProtocol(parsed.data.adapterType) }
      : {}),
    updatedAt: new Date(),
  };
  const [row] = await getDb().update(providers)
    .set(values)
    .where(eq(providers.id, providerId))
    .returning();
  return row ? ok(c, safeProvider(row)) : fail(c, 'NOT_FOUND', 'Provider not found', 404);
});

providerRoutes.delete('/:id', async (c) => {
  const providerId = c.req.param('id');
  if (await providerHasDefaultModel(providerId)) {
    return fail(c, 'DEFAULT_PROVIDER_DELETE_FORBIDDEN', 'Reassign default roles before deleting this provider', 409);
  }
  try {
    const [row] = await getDb().delete(providers)
      .where(eq(providers.id, providerId))
      .returning();
    return row ? ok(c, { ok: true }) : fail(c, 'NOT_FOUND', 'Provider not found', 404);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      return fail(c, 'PROVIDER_IN_USE', 'Provider is referenced by generation jobs', 409);
    }
    throw error;
  }
});
