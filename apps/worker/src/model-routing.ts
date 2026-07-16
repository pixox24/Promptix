import type { JobType, ModelCapability } from '@promptix/shared';

type CapabilityModel = { name: string; capabilities: ModelCapability[] };
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

export function imageReverseNeedsVisionFallback(model: CapabilityModel) {
  return !model.capabilities.includes('vision');
}
