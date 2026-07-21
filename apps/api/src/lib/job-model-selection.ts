import type { JobType, ModelCapability } from '@promptix/shared';

export type JobModelRole = 'text' | 'image';

type JobModelCandidate = {
  id: string;
  modelId: string;
  capabilities: ModelCapability[];
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

export function defaultRoleForJob(jobType: JobType): JobModelRole | null {
  switch (jobType) {
    case 'text_expand':
    case 'structure':
    case 'image_reverse':
    case 'provider_test':
    case 'template_governance_plan':
      return 'text';
    case 'image_generate':
      return 'image';
    case 'noop':
    case 'template_governance_apply':
    case 'template_governance_rollback':
      return null;
  }
}

export function requiredCapabilitiesForJob(jobType: JobType): ModelCapability[] {
  switch (jobType) {
    case 'text_expand':
    case 'structure':
    case 'image_reverse':
    case 'template_governance_plan':
      return ['text', 'structured_output'];
    case 'provider_test':
      return ['text'];
    case 'image_generate':
      return ['image'];
    case 'noop':
    case 'template_governance_apply':
    case 'template_governance_rollback':
      return [];
  }
}

export function supportsJobType(
  candidate: Pick<JobModelCandidate, 'capabilities'>,
  jobType: JobType,
) {
  const capabilities = new Set(candidate.capabilities);
  return requiredCapabilitiesForJob(jobType).every((value) => capabilities.has(value));
}

export function selectLegacyModelCandidate<T extends JobModelCandidate>(
  candidates: T[],
  jobType: JobType,
  legacyDefaultModelId: string,
) {
  const compatible = candidates.filter((candidate) => supportsJobType(candidate, jobType));
  const role = defaultRoleForJob(jobType);
  if (!role) return undefined;

  return compatible.find((candidate) =>
    Boolean(legacyDefaultModelId) && candidate.modelId === legacyDefaultModelId)
    ?? compatible.find((candidate) => role === 'text'
      ? candidate.isDefaultText
      : candidate.isDefaultImage)
    ?? compatible[0];
}
