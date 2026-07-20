import { templateDraftSchema } from '@promptix/shared';
import type { AdminModel } from '../types/adminModels';
import type { IngestFlowStatus } from '../types/ingest';

export function eligibleIngestModels(models: AdminModel[]) {
  return eligibleStructureModels(models);
}

export function eligibleStructureModels(models: AdminModel[]) {
  return models.filter((model) => model.enabled && model.providerEnabled &&
    model.capabilities.includes('text') && model.capabilities.includes('structured_output'));
}

export function eligibleVisionModels(models: AdminModel[]) {
  return models.filter((model) => model.enabled && model.providerEnabled &&
    model.capabilities.includes('text') && model.capabilities.includes('vision'));
}

export function ingestFlowStatus(job?: { status: string; output?: unknown }): IngestFlowStatus {
  if (!job) return 'idle';
  if (job.status === 'queued') return 'queued';
  if (job.status === 'running') return 'running';
  if (job.status === 'succeeded') return 'review';
  if (job.status === 'failed') return 'failed';
  return 'idle';
}

export function parseIngestDraft(output: unknown) {
  return templateDraftSchema.safeParse(output);
}
