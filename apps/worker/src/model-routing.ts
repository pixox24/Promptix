import type { JobType, ModelCapability } from '@promptix/shared';

type CapabilityModel = { name: string; capabilities: ModelCapability[] };
type LegacyModelCandidate = CapabilityModel & {
  id: string;
  modelId: string;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};
export type ModelRole = 'text' | 'vision' | 'image';

export function roleForJob(jobType: JobType): ModelRole | null {
  switch (jobType) {
    case 'text_expand':
    case 'structure':
    case 'image_reverse':
      return 'text';
    case 'image_generate':
      return 'image';
    case 'noop':
      return null;
  }
}

export function assertCapabilitiesForJob(model: CapabilityModel, jobType: JobType) {
  const capabilities = new Set(model.capabilities);
  if (jobType === 'image_generate') {
    if (!capabilities.has('image')) {
      throw new Error(`Model ${model.name} lacks image capability`);
    }
    return;
  }
  if (jobType === 'text_expand' || jobType === 'structure' || jobType === 'image_reverse') {
    if (!capabilities.has('text') || !capabilities.has('structured_output')) {
      throw new Error(`Model ${model.name} lacks text or structured_output capability`);
    }
  }
}

export function supportsJob(model: CapabilityModel, jobType: JobType) {
  try {
    assertCapabilitiesForJob(model, jobType);
    return true;
  } catch {
    return false;
  }
}

export function selectLegacyModel<T extends LegacyModelCandidate>(
  candidates: T[],
  jobType: JobType,
  legacyDefaultModelId: string,
) {
  const compatible = candidates.filter((candidate) => supportsJob(candidate, jobType));
  const role = roleForJob(jobType);
  if (!role) return undefined;

  return compatible.find((candidate) =>
    Boolean(legacyDefaultModelId) && candidate.modelId === legacyDefaultModelId)
    ?? compatible.find((candidate) => role === 'text'
      ? candidate.isDefaultText
      : role === 'vision'
        ? candidate.isDefaultVision
        : candidate.isDefaultImage)
    ?? compatible[0];
}

export function imageReverseNeedsVisionFallback(model: CapabilityModel) {
  return !model.capabilities.includes('vision');
}
