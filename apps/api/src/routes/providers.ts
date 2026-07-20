import { Hono } from 'hono';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  modelCapabilitySchema,
  providerAdapterCapabilityError,
  providerAdapterSchema,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { generationJobs, providerModels, providers } from '../db/schema.js';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { enqueueGenerationJob } from '../lib/job-enqueue.js';
import {
  providerTextTestProblem,
  providerTextTestProblemResponse,
} from '../lib/provider-text-test.js';
import { fail, ok } from '../lib/response.js';
import { normalizeProviderBaseUrl, providerIdentity } from '../lib/provider-identity.js';

const providerInput = z.object({
  name: z.string().trim().min(1).max(120),
  adapterType: providerAdapterSchema,
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional().nullable(),
  authStyle: z.enum(['bearer', 'header']).default('bearer'),
  enabled: z.boolean().default(true),
});

const providerTestInput = z.object({
  modelId: z.string().uuid(),
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

providerRoutes.get('/:providerId/models', async (c) => {
  const [provider] = await getDb().select().from(providers)
    .where(eq(providers.id, c.req.param('providerId'))).limit(1);
  if (!provider) return fail(c, 'NOT_FOUND', 'Provider not found', 404);
  if (!['openai', 'openai_compatible', 'deepseek'].includes(provider.adapterType)) {
    return fail(c, 'MODEL_DISCOVERY_UNSUPPORTED', '该 Provider 不支持自动拉取模型，请手动输入 Model ID', 422);
  }
  const key = provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined;
  if (!key) return fail(c, 'PROVIDER_KEY_NOT_CONFIGURED', 'Provider 的密钥环境变量未配置', 409);
  const headers: Record<string, string> = provider.authStyle === 'header'
    ? { 'X-API-Key': key }
    : { Authorization: `Bearer ${key}` };
  try {
    const response = await fetch(`${normalizeProviderBaseUrl(provider.baseUrl)}/models`, {
      headers: { ...headers, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return fail(c, 'MODEL_DISCOVERY_FAILED', `厂商模型列表请求失败（HTTP ${response.status}）`, 502);
    const payload = await response.json() as { data?: Array<{ id?: string; name?: string }> };
    const models = (payload.data ?? []).filter((item) => typeof item.id === 'string' && item.id.trim()).map((item) => ({
      id: item.id!.trim(), name: item.name?.trim() || item.id!.trim(), capabilities: ['text', 'structured_output'],
    }));
    return ok(c, models);
  } catch {
    return fail(c, 'MODEL_DISCOVERY_FAILED', '无法连接厂商模型列表接口，请检查地址和密钥，或手动输入', 502);
  }
});

providerRoutes.post('/', async (c) => {
  const parsed = providerInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const normalized = { ...parsed.data, baseUrl: normalizeProviderBaseUrl(parsed.data.baseUrl) };
  const existingProviders = await getDb().select().from(providers);
  if (existingProviders.some((item) => providerIdentity(item) === providerIdentity(normalized))) {
    return fail(c, 'PROVIDER_ALREADY_EXISTS', '相同的适配器、地址、密钥环境变量和认证方式已经存在 Provider', 409);
  }
  const [row] = await getDb().insert(providers).values({
    ...normalized,
    kind: 'llm',
    protocol: legacyProtocol(parsed.data.adapterType),
    defaultModel: '',
    defaults: {},
    isDefault: false,
  }).returning();
  return ok(c, safeProvider(row), 201);
});

providerRoutes.post('/:providerId/test', async (c) => {
  const parsed = providerTestInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider test', 400);
  }

  const [provider] = await getDb().select().from(providers)
    .where(eq(providers.id, c.req.param('providerId')))
    .limit(1);
  if (!provider) return fail(c, 'NOT_FOUND', 'Provider not found', 404);

  const [model] = await getDb().select().from(providerModels)
    .where(eq(providerModels.id, parsed.data.modelId))
    .limit(1);
  const problem = providerTextTestProblem(provider, model ?? null, process.env);
  if (problem) {
    const response = providerTextTestProblemResponse[problem];
    return fail(c, problem, response.message, response.status);
  }

  const [job] = await getDb().insert(generationJobs).values({
    type: 'provider_test',
    status: 'pending',
    actorId: c.get('admin').sub,
    providerId: provider.id,
    modelId: model!.id,
    input: {},
  }).returning();
  try {
    await enqueueGenerationJob(job.id, { attempts: 1 });
  } catch (error) {
    await getDb().update(generationJobs).set({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Queue unavailable',
      finishedAt: new Date(),
    }).where(eq(generationJobs.id, job.id));
    return fail(c, 'QUEUE_UNAVAILABLE', 'Redis queue is unavailable', 503);
  }
  return ok(c, { jobId: job.id, status: 'queued' }, 202);
});

providerRoutes.patch('/:id', async (c) => {
  const parsed = providerInput.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return fail(c, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid provider', 400);
  }
  const providerId = c.req.param('id');
  if (parsed.data.baseUrl || parsed.data.adapterType || parsed.data.apiKeyEnv !== undefined || parsed.data.authStyle) {
    const [current] = await getDb().select().from(providers).where(eq(providers.id, providerId)).limit(1);
    if (current) {
      const candidate = { ...current, ...parsed.data, baseUrl: normalizeProviderBaseUrl(parsed.data.baseUrl ?? current.baseUrl) };
      const peers = await getDb().select().from(providers).where(sql`${providers.id} <> ${providerId}`);
      if (peers.some((item) => providerIdentity(item) === providerIdentity(candidate))) {
        return fail(c, 'PROVIDER_ALREADY_EXISTS', '相同的 Provider 连接参数已经存在', 409);
      }
    }
  }
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
    ...(parsed.data.baseUrl ? { baseUrl: normalizeProviderBaseUrl(parsed.data.baseUrl) } : {}),
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
  const [existing] = await getDb().select({ id: providers.id }).from(providers)
    .where(eq(providers.id, providerId)).limit(1);
  if (!existing) return fail(c, 'NOT_FOUND', 'Provider not found', 404);
  await getDb().transaction(async (tx) => {
    await tx.update(generationJobs).set({ providerId: null }).where(eq(generationJobs.providerId, providerId));
    await tx.delete(providers).where(eq(providers.id, providerId));
  });
  return ok(c, { ok: true });
});
