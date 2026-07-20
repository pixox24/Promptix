import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  modelCapabilitySchema,
  modelDefaultsSchema,
  providerAdapterCapabilityError,
  providerAdapterSchema,
  providerModelInputSchema,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { generationJobs, providerModels, providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { fail, ok } from '../lib/response.js';
import { hasDefaultRole, modelIdentityChangeError } from '../lib/model-policy.js';
import { normalizeModelId } from '../lib/provider-identity.js';

const modelPatchSchema = z.object({
  providerId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  capabilities: z.array(modelCapabilitySchema).min(1).optional(),
  defaults: modelDefaultsSchema.optional(),
  enabled: z.boolean().optional(),
  isDefaultText: z.boolean().optional(),
  isDefaultVision: z.boolean().optional(),
  isDefaultImage: z.boolean().optional(),
});

async function providerConnection(providerId: string) {
  const [provider] = await getDb().select({
    id: providers.id,
    enabled: providers.enabled,
    adapterType: providers.adapterType,
  })
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);
  return provider
    ? { ...provider, adapterType: providerAdapterSchema.parse(provider.adapterType) }
    : null;
}

export const modelRoutes = new Hono<AdminVars>();
modelRoutes.use('*', requireAdmin);

modelRoutes.get('/', async (c) => {
  const providerId = c.req.query('providerId');
  const capability = c.req.query('capability');
  if (capability && !modelCapabilitySchema.safeParse(capability).success) {
    return fail(c, 'VALIDATION_ERROR', 'Invalid model capability', 400);
  }
  const filters = [
    ...(providerId ? [eq(providerModels.providerId, providerId)] : []),
    ...(capability
      ? [sql`${providerModels.capabilities} @> ARRAY[${capability}]::text[]`]
      : []),
  ];
  const rows = await getDb().select({
    model: providerModels,
    providerName: providers.name,
    providerEnabled: providers.enabled,
    adapterType: providers.adapterType,
    apiKeyEnv: providers.apiKeyEnv,
  }).from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(providerModels.updatedAt));
  return ok(c, rows.map((row) => ({
    ...row.model,
    providerName: row.providerName,
    providerEnabled: row.providerEnabled,
    adapterType: row.adapterType,
    apiKeyConfigured: Boolean(row.apiKeyEnv && process.env[row.apiKeyEnv]),
  })));
});

modelRoutes.post('/', async (c) => {
  const parsed = providerModelInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  const provider = await providerConnection(parsed.data.providerId);
  if (!provider) {
    return fail(c, 'PROVIDER_NOT_FOUND', 'Provider not found', 404);
  }
  const compatibilityError = providerAdapterCapabilityError(
    provider.adapterType,
    parsed.data.capabilities,
  );
  if (compatibilityError) {
    return fail(c, 'MODEL_ADAPTER_CAPABILITY_MISMATCH', compatibilityError, 400);
  }
  if (hasDefaultRole(parsed.data) && !provider.enabled) {
    return fail(c, 'DEFAULT_PROVIDER_DISABLED', 'Enable the provider before assigning a default role', 409);
  }
  const sameModel = await getDb().select({ id: providerModels.id }).from(providerModels)
    .where(and(eq(providerModels.providerId, parsed.data.providerId), sql`lower(trim(${providerModels.modelId})) = ${normalizeModelId(parsed.data.modelId)}`)).limit(1);
  if (sameModel.length) return fail(c, 'MODEL_ALREADY_EXISTS', '该 Provider 已存在相同的 Model ID（名称不同也不能重复添加）', 409);
  try {
    const row = await getDb().transaction(async (tx) => {
      if (parsed.data.isDefaultText) {
        await tx.update(providerModels).set({ isDefaultText: false })
          .where(eq(providerModels.isDefaultText, true));
      }
      if (parsed.data.isDefaultVision) {
        await tx.update(providerModels).set({ isDefaultVision: false })
          .where(eq(providerModels.isDefaultVision, true));
      }
      if (parsed.data.isDefaultImage) {
        await tx.update(providerModels).set({ isDefaultImage: false })
          .where(eq(providerModels.isDefaultImage, true));
      }
      const [created] = await tx.insert(providerModels).values(parsed.data).returning();
      return created;
    });
    return ok(c, row, 201);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(c, 'MODEL_ALREADY_EXISTS', 'This provider already contains the model ID', 409);
    }
    throw error;
  }
});

modelRoutes.patch('/:id', async (c) => {
  const patch = modelPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!patch.success) {
    return fail(c, 'VALIDATION_ERROR', patch.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  const [existing] = await getDb().select().from(providerModels)
    .where(eq(providerModels.id, c.req.param('id')))
    .limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Model not found', 404);

  const identityError = modelIdentityChangeError(existing, patch.data);
  if (identityError) {
    return fail(c, 'MODEL_IDENTITY_IMMUTABLE', identityError, 409);
  }

  const merged = providerModelInputSchema.safeParse({ ...existing, ...patch.data });
  if (!merged.success) {
    return fail(c, 'VALIDATION_ERROR', merged.error.issues[0]?.message ?? 'Invalid model', 400);
  }
  const provider = await providerConnection(merged.data.providerId);
  if (!provider) {
    return fail(c, 'PROVIDER_NOT_FOUND', 'Provider not found', 404);
  }
  const compatibilityError = providerAdapterCapabilityError(
    provider.adapterType,
    merged.data.capabilities,
  );
  if (compatibilityError) {
    return fail(c, 'MODEL_ADAPTER_CAPABILITY_MISMATCH', compatibilityError, 400);
  }
  if (hasDefaultRole(merged.data) && !provider.enabled) {
    return fail(c, 'DEFAULT_PROVIDER_DISABLED', 'Enable the provider before assigning a default role', 409);
  }
  const duplicate = await getDb().select({ id: providerModels.id }).from(providerModels)
    .where(and(eq(providerModels.providerId, merged.data.providerId), sql`${providerModels.id} <> ${existing.id}`, sql`lower(trim(${providerModels.modelId})) = ${normalizeModelId(merged.data.modelId)}`)).limit(1);
  if (duplicate.length) return fail(c, 'MODEL_ALREADY_EXISTS', '该 Provider 已存在相同的 Model ID（名称不同也不能重复添加）', 409);

  try {
    const row = await getDb().transaction(async (tx) => {
      if (merged.data.isDefaultText) {
        await tx.update(providerModels).set({ isDefaultText: false })
          .where(eq(providerModels.isDefaultText, true));
      }
      if (merged.data.isDefaultVision) {
        await tx.update(providerModels).set({ isDefaultVision: false })
          .where(eq(providerModels.isDefaultVision, true));
      }
      if (merged.data.isDefaultImage) {
        await tx.update(providerModels).set({ isDefaultImage: false })
          .where(eq(providerModels.isDefaultImage, true));
      }
      const [updated] = await tx.update(providerModels).set({
        ...merged.data,
        updatedAt: new Date(),
      }).where(eq(providerModels.id, existing.id)).returning();
      return updated;
    });
    return ok(c, row);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return fail(c, 'MODEL_ALREADY_EXISTS', 'This provider already contains the model ID', 409);
    }
    throw error;
  }
});

modelRoutes.delete('/:id', async (c) => {
  const [existing] = await getDb().select().from(providerModels)
    .where(eq(providerModels.id, c.req.param('id')))
    .limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Model not found', 404);
  if (existing.isDefaultText || existing.isDefaultVision || existing.isDefaultImage) {
    return fail(c, 'DEFAULT_MODEL_DELETE_FORBIDDEN', 'Reassign default roles before deleting this model', 409);
  }
  await getDb().transaction(async (tx) => {
    await tx.update(generationJobs).set({ modelId: null }).where(eq(generationJobs.modelId, existing.id));
    await tx.delete(providerModels).where(eq(providerModels.id, existing.id));
  });
  return ok(c, { ok: true });
});
