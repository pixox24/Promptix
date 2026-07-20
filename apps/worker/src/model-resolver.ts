import { and, asc, eq } from 'drizzle-orm';
import {
  modelCapabilitySchema,
  providerAdapterSchema,
  type JobType,
} from '@promptix/shared';
import { db, providerModels, providers } from './db.js';
import {
  roleForJob,
  selectLegacyModel,
  type ModelRole,
} from './model-routing.js';
import type { ResolvedModel } from './model-types.js';

function parseResolved(row: {
  provider: typeof providers.$inferSelect;
  model: typeof providerModels.$inferSelect;
}): ResolvedModel {
  return {
    provider: {
      ...row.provider,
      adapterType: providerAdapterSchema.parse(row.provider.adapterType),
    },
    model: {
      ...row.model,
      capabilities: modelCapabilitySchema.array().parse(row.model.capabilities),
    },
  };
}

async function byModelId(modelId: string) {
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(providerModels.id, modelId),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .limit(1);
  return row ? parseResolved(row) : null;
}

export async function resolveVisionModel(modelId: string | null) {
  const resolved = modelId ? await byModelId(modelId) : await byDefaultRole('vision');
  if (!resolved) throw new Error(modelId
    ? `Enabled vision model ${modelId} was not found`
    : 'No enabled default vision model is configured');
  if (!resolved.model.capabilities.includes('text') || !resolved.model.capabilities.includes('vision')) {
    throw new Error(`Model ${resolved.model.name} lacks text or vision capability`);
  }
  return resolved;
}

export async function resolveImageReverseModels({ structureModelId, structureProviderId, visionModelId }: { structureModelId: string | null; structureProviderId: string | null; visionModelId: string | null }) {
  const [structure, vision] = await Promise.all([
    resolvePrimaryModel('image_reverse', structureModelId, structureProviderId),
    resolveVisionModel(visionModelId),
  ]);
  return { structure, vision };
}

async function byLegacyProviderId(providerId: string, jobType: JobType) {
  const rows = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(providerModels.providerId, providerId),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .orderBy(asc(providerModels.createdAt));
  if (!rows.length) return null;

  const resolved = rows.map(parseResolved);
  const selected = selectLegacyModel(
    resolved.map((row) => row.model),
    jobType,
    resolved[0].provider.defaultModel,
  );
  return selected
    ? resolved.find((row) => row.model.id === selected.id) ?? null
    : null;
}

async function byDefaultRole(role: ModelRole) {
  const roleColumn = role === 'text'
    ? providerModels.isDefaultText
    : role === 'vision'
      ? providerModels.isDefaultVision
      : providerModels.isDefaultImage;
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(roleColumn, true),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .limit(1);
  return row ? parseResolved(row) : null;
}

export async function resolvePrimaryModel(
  jobType: JobType,
  modelId: string | null,
  providerId: string | null,
) {
  const role = roleForJob(jobType);
  if (!role) throw new Error(`Job type ${jobType} does not use a model`);
  const resolved = modelId
    ? await byModelId(modelId)
    : providerId
      ? await byLegacyProviderId(providerId, jobType)
      : await byDefaultRole(role);
  if (!resolved) {
    throw new Error(modelId
      ? `Enabled model ${modelId} was not found`
      : providerId
        ? `No enabled model exists for legacy provider ${providerId}`
        : `No enabled default ${role} model is configured`);
  }
  return resolved;
}

export async function resolveDefaultVisionModel() {
  const resolved = await byDefaultRole('vision');
  if (!resolved) throw new Error('No enabled default vision model is configured');
  return resolved;
}
