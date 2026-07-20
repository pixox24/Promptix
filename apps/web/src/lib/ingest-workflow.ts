import { legacyTemplateDraftSchema, templateDraftSchema } from '@promptix/shared';
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
  const current = templateDraftSchema.safeParse(output);
  if (current.success) return current;
  const legacy = legacyTemplateDraftSchema.safeParse(output);
  if (!legacy.success) return current;
  const outputTypeMap: Record<string, string> = {
    portrait: 'portrait', ecommerce: 'product_image', poster: 'poster', logo: 'logo',
    illustration: 'illustration', edit: 'general_visual',
  };
  return templateDraftSchema.safeParse({
    name: legacy.data.name,
    summary: legacy.data.summary,
    description: legacy.data.description,
    semantic: {
      workflowType: legacy.data.category === 'edit' ? 'edit' : 'generate',
      outputType: outputTypeMap[legacy.data.category] ?? null,
      scenarios: [], styles: [], subjects: [], tags: legacy.data.tags,
      unmappedTerms: legacy.data.scenarios.map((label) => ({
        dimension: 'scenario', label, reason: '遗留任务使用中文场景，需要人工重新映射',
      })),
      confidence: {},
    },
    variables: legacy.data.variables,
    promptTemplate: legacy.data.promptTemplate,
    negativePrompt: legacy.data.negativePrompt,
  });
}
