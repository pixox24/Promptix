import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { autopublishRulesSchema } from '@promptix/shared';
import { and, eq, sql } from 'drizzle-orm';
import { Hono, type Context, type Next } from 'hono';
import { getDb } from '../db/client.js';
import {
  agentCapabilityGrants,
  governanceRuleSets,
  mediaObjects,
  templateAutopublishSourceItems,
  templateAutopublishRuns,
  templateGovernanceState,
} from '../db/schema.js';
import { requireOwner, type AdminVars } from '../lib/auth.js';
import { AutopublishCapabilityError } from '../lib/autopublish-capabilities.js';
import { createAutopublishRepository } from '../lib/autopublish-repository.js';
import {
  AutopublishServiceError,
  autopublishInputFingerprint,
  createAutopublishService,
  normalizeAutopublishInput,
  type AutopublishService,
  type CreateAutopublishRunInput,
} from '../lib/autopublish-service.js';
import { loadIngestSystemPrompt } from '../lib/ingest-system-prompts.js';
import { enqueueAutopublishRun } from '../lib/job-enqueue.js';
import { deleteObject, putObject, storageKind } from '../lib/storage.js';
import { loadActiveTaxonomySnapshot } from '../lib/taxonomy.js';
import { ALLOWED_AUTOPUBLISH_SOURCE_TYPES } from '../lib/autopublish-scheduler.js';
import { databaseAutopublishOperations } from '../lib/autopublish-operations.js';

export const MAX_PRIVATE_INPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const GRANT_LIFETIME_MS = 15 * 60 * 1000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const AGENT_ID = 'promptix-admin-autopublish';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function promptVersion(prompt: string) {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`;
}

async function activeRules() {
  const [row] = await getDb().select().from(governanceRuleSets)
    .where(eq(governanceRuleSets.enabled, true)).limit(1);
  if (!row) throw new AutopublishServiceError('AUTOPUBLISH_RULES_NOT_FOUND');
  const parsed = autopublishRulesSchema.safeParse(row.rules);
  if (!parsed.success) throw new AutopublishServiceError('AUTOPUBLISH_RULES_INVALID');
  return { id: row.id, version: row.version, rules: parsed.data };
}

function productionService(): AutopublishService {
  return createAutopublishService(createAutopublishRepository(), {
    hash,
    now: () => new Date(),
    loadRules: activeRules,
    loadTaxonomy: loadActiveTaxonomySnapshot,
    loadPromptVersion: async (flowType) => promptVersion(await loadIngestSystemPrompt(flowType)),
  });
}

type ProvisionedInput = {
  input: CreateAutopublishRunInput;
  cleanup(): Promise<void>;
};

type CreateBody = {
  flowType?: unknown;
  text?: unknown;
  allowAutomaticRepair?: unknown;
  sourceType?: unknown;
  sourceItemId?: unknown;
  modelId?: unknown;
  visionModelId?: unknown;
  idempotencyKey?: unknown;
};

function extensionFor(file: File) {
  const fromName = extname(file.name).slice(1).toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  };
  return byMime[file.type] ?? 'bin';
}

async function provision(body: CreateBody, file: File | null, adminId: string): Promise<ProvisionedInput> {
  const runId = randomUUID();
  const grantId = randomUUID();
  const flowType = body.flowType === 'image_reverse' ? 'image_reverse' : 'text_expand';
  const sourceType = typeof body.sourceType === 'string' && body.sourceType.trim()
    ? body.sourceType.trim()
    : file ? 'admin_image_upload' : 'admin_text';
  const imageBytes = file ? Buffer.from(await file.arrayBuffer()) : null;
  if (file && (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES)) {
    throw new AutopublishServiceError('AUTOPUBLISH_IMAGE_INVALID');
  }
  const imageContentHash = imageBytes
    ? createHash('sha256').update(imageBytes).digest('hex')
    : undefined;
  const sourceItemId = typeof body.sourceItemId === 'string' && body.sourceItemId.trim()
    ? body.sourceItemId.trim()
    : imageContentHash ?? runId;
  const extension = file ? extensionFor(file) : null;
  const privateInputObjectKey = extension
    ? `private/autopublish/${runId}/source.${extension}`
    : undefined;
  const input: CreateAutopublishRunInput = {
    runId,
    flowType,
    triggerType: 'delegated',
    ...(typeof body.text === 'string' ? { text: body.text } : {}),
    ...(typeof body.allowAutomaticRepair === 'boolean'
      ? { allowAutomaticRepair: body.allowAutomaticRepair }
      : {}),
    sourceType,
    sourceItemId,
    ...(typeof body.modelId === 'string' ? { modelId: body.modelId } : {}),
    ...(typeof body.visionModelId === 'string' ? { visionModelId: body.visionModelId } : {}),
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    requestedBy: adminId,
    agentId: AGENT_ID,
    capabilityGrantId: grantId,
    ...(privateInputObjectKey ? { privateInputObjectKey } : {}),
    ...(imageContentHash ? { imageContentHash } : {}),
  };
  const inputSnapshotHash = hash(
    autopublishInputFingerprint(normalizeAutopublishInput(input).inputSnapshot),
  );
  const rules = await activeRules();
  let stored = false;
  try {
    if (imageBytes && privateInputObjectKey && file) {
      const object = await putObject(privateInputObjectKey, imageBytes, file.type);
      await getDb().insert(mediaObjects).values({
        objectKey: object.objectKey,
        bucket: storageKind() === 'oss' ? 'private' : 'local-private',
        url: '',
        storageClass: 'temp',
        prefixKind: 'private/autopublish',
        expiresAt: new Date(Date.now() + MAX_PRIVATE_INPUT_RETENTION_MS),
        ownerType: 'autopublish_run',
        ownerId: runId,
        mime: file.type,
        bytes: file.size,
      });
      stored = true;
    }
    await getDb().insert(agentCapabilityGrants).values({
      id: grantId,
      triggerType: 'delegated',
      agentId: AGENT_ID,
      initiatedBy: adminId,
      scopes: ['autopublish.run:create'],
      inputSnapshotHash,
      sourceConstraints: {
        sourceTypes: [sourceType],
        sourceItemIds: [sourceItemId],
        flowTypes: [flowType],
      },
      budget: rules.rules.budgets,
      expiresAt: new Date(Date.now() + GRANT_LIFETIME_MS),
    });
    return {
      input,
      async cleanup() {
        await getDb().delete(agentCapabilityGrants).where(eq(agentCapabilityGrants.id, grantId));
        if (stored && privateInputObjectKey) {
          await getDb().delete(mediaObjects).where(and(
            eq(mediaObjects.objectKey, privateInputObjectKey),
            eq(mediaObjects.ownerId, runId),
          ));
          await deleteObject(privateInputObjectKey);
        }
      },
    };
  } catch (error) {
    if (stored && privateInputObjectKey) await deleteObject(privateInputObjectKey);
    throw error;
  }
}

const ERROR_STATUS: Record<string, 400 | 401 | 403 | 404 | 409 | 500> = {
  AUTOPUBLISH_INPUT_INVALID: 400,
  AUTOPUBLISH_IMAGE_INVALID: 400,
  AUTOPUBLISH_RUN_NOT_FOUND: 404,
  AUTOPUBLISH_CANCEL_ADMIN_REQUIRED: 403,
  AUTOPUBLISH_ACTION_ADMIN_REQUIRED: 403,
  AUTOPUBLISH_ACTION_FORBIDDEN: 409,
  AUTOPUBLISH_ACTION_IDEMPOTENCY_REQUIRED: 400,
  AUTOPUBLISH_IDEMPOTENCY_MISMATCH: 409,
  AUTOPUBLISH_RUN_TERMINAL: 409,
};

function errorResponse(c: Context, error: unknown) {
  const known = error instanceof AutopublishServiceError || error instanceof AutopublishCapabilityError;
  const code = known ? error.code : 'AUTOPUBLISH_INTERNAL_ERROR';
  const status = ERROR_STATUS[code] ?? (known ? 409 : 500);
  const nextAllowedActions = code === 'AUTOPUBLISH_GRANT_EXPIRED' ? ['create_new_run'] : [];
  return c.json({
    error: {
      code,
      message: known ? error.message : '自动发布服务暂时不可用',
      retryable: status >= 500,
      nextAllowedActions,
    },
  }, status);
}

async function requireStableOwner(c: Context<AdminVars>, next: Next) {
  const response = await requireOwner(c, next);
  if (!(response instanceof Response)) return response;
  const code = response.status === 401 ? 'AUTOPUBLISH_UNAUTHORIZED' : 'AUTOPUBLISH_FORBIDDEN';
  return c.json({
    error: {
      code,
      message: response.status === 401 ? '请先登录管理员账号' : '仅管理员或所有者可执行此操作',
      retryable: false,
      nextAllowedActions: [],
    },
  }, response.status as 401 | 403);
}

export const autopublishRoutes = new Hono<AdminVars>();
autopublishRoutes.use('*', requireStableOwner);

autopublishRoutes.post('/runs', async (c) => {
  let candidate: ProvisionedInput | null = null;
  try {
    const contentType = c.req.header('content-type') ?? '';
    let body: CreateBody;
    let file: File | null = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const rawFile = form.get('image');
      file = rawFile instanceof File ? rawFile : null;
      body = Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string'));
    } else {
      body = await c.req.json<CreateBody>();
    }
    candidate = await provision(body, file, c.get('admin').sub);
    const result = await productionService().create(candidate.input);
    if (result.id !== candidate.input.runId) await candidate.cleanup();
    try {
      await enqueueAutopublishRun(result.id);
    } catch (error) {
      console.warn('[autopublish] queue wakeup failed; durable outbox will retry', error);
    }
    return c.json({
      data: {
        runId: result.id,
        status: result.status,
        currentStage: result.currentStage,
        statusUrl: `/api/admin/autopublish/runs/${result.id}`,
      },
    }, 202);
  } catch (error) {
    if (candidate) await candidate.cleanup().catch(() => undefined);
    return errorResponse(c, error);
  }
});

autopublishRoutes.post('/source-items', async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    const sourceType = typeof body.sourceType === 'string' ? body.sourceType.trim() : '';
    const sourceItemId = typeof body.sourceItemId === 'string' ? body.sourceItemId.trim() : '';
    const flowType = body.flowType === 'image_reverse' ? 'image_reverse' : 'text_expand';
    if (!ALLOWED_AUTOPUBLISH_SOURCE_TYPES.includes(sourceType as never)) {
      throw new AutopublishServiceError('AUTOPUBLISH_SOURCE_FORBIDDEN');
    }
    if (!sourceItemId || sourceItemId.length > 200) {
      throw new AutopublishServiceError('AUTOPUBLISH_INPUT_INVALID');
    }
    const payload = typeof body.payload === 'object' && body.payload !== null ? body.payload : {};
    const [item] = await getDb().insert(templateAutopublishSourceItems).values({
      sourceType, sourceItemId, flowType, payload,
    }).onConflictDoNothing().returning();
    return c.json({ data: item ?? { sourceType, sourceItemId, flowType, replayed: true } }, 202);
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.get('/overview', async (c) => {
  try {
    return c.json({ data: await databaseAutopublishOperations().overview() });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.get('/runs', async (c) => {
  try {
    const rows = await getDb().select().from(templateAutopublishRuns)
      .orderBy(sql`${templateAutopublishRuns.createdAt} desc`).limit(100);
    return c.json({ data: rows });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.get('/observations', async (c) => {
  try {
    const rows = await getDb().select().from(templateGovernanceState)
      .where(eq(templateGovernanceState.lifecycleState, 'published_observing'))
      .limit(100);
    return c.json({ data: rows });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.post('/freeze', async (c) => {
  try {
    const body = await c.req.json<{ reason?: unknown; frozen?: unknown }>();
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'manual control';
    const operations = databaseAutopublishOperations();
    const data = body.frozen === false
      ? await operations.unfreeze({ actorId: c.get('admin').sub, reason })
      : await operations.freeze({ actorId: c.get('admin').sub, reason });
    return c.json({ data });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.post('/mode', async (c) => {
  try {
    const body = await c.req.json<{ mode?: unknown; reason?: unknown }>();
    if (body.mode !== 'shadow' && body.mode !== 'live') {
      throw new AutopublishServiceError('AUTOPUBLISH_MODE_INVALID');
    }
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'manual control';
    const data = await databaseAutopublishOperations().mode({
      actorId: c.get('admin').sub, reason, mode: body.mode,
    });
    return c.json({ data });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.get('/runs/:id', async (c) => {
  try {
    const run = await productionService().get(c.req.param('id'));
    if (!run) throw new AutopublishServiceError('AUTOPUBLISH_RUN_NOT_FOUND');
    return c.json({ data: run });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.post('/runs/:id/cancel', async (c) => {
  try {
    const run = await productionService().cancel(
      c.req.param('id'),
      { type: 'admin', id: c.get('admin').sub },
    );
    return c.json({ data: run });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.post('/runs/:id/actions/:action', async (c) => {
  try {
    const body = await c.req.json<{ idempotencyKey?: unknown }>();
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    const run = await productionService().act(
      c.req.param('id'),
      c.req.param('action') as never,
      { type: 'admin', id: c.get('admin').sub },
      idempotencyKey,
    );
    return c.json({ data: run });
  } catch (error) {
    return errorResponse(c, error);
  }
});

autopublishRoutes.get('/exceptions', async (c) => {
  try {
    return c.json({ data: await productionService().listExceptions() });
  } catch (error) {
    return errorResponse(c, error);
  }
});
