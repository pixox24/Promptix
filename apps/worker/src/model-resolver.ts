import { and, desc, eq } from 'drizzle-orm';
import {
  modelCapabilitySchema,
  providerAdapterSchema,
  type JobType,
} from '@promptix/shared';
import { db, providerModels, providers } from './db.js';
import { roleForJob, type ModelRole } from './model-routing.js';
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

async function byLegacyProviderId(providerId: string) {
  const [row] = await db.select({ provider: providers, model: providerModels })
    .from(providerModels)
    .innerJoin(providers, eq(providerModels.providerId, providers.id))
    .where(and(
      eq(providerModels.providerId, providerId),
      eq(providerModels.enabled, true),
      eq(providers.enabled, true),
    ))
    .orderBy(desc(providerModels.updatedAt))
    .limit(1);
  return row ? parseResolved(row) : null;
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
      ? await byLegacyProviderId(providerId)
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
