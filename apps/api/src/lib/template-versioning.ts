import type { SemanticClassification, TemplateVersionSnapshot } from '@promptix/shared';

export type TemplateVersionActor = {
  actorId?: string | null;
  source: 'admin' | 'agent' | 'rollback' | 'migration';
  runId?: string | null;
  changeSetId?: string | null;
};

type VersionedTemplate = Record<string, unknown> & {
  id: string;
  currentVersion: number;
};

export type TemplateVersionRepository<T extends VersionedTemplate> = {
  findIdempotentResult(key: string): Promise<T | null>;
  loadTemplate(id: string): Promise<T | null>;
  updateIfVersion(id: string, expectedVersion: number, patch: Partial<T>): Promise<T | null>;
  replaceSemantic?(templateId: string): Promise<void>;
  insertVersion(input: {
    templateId: string;
    version: number;
    snapshot: TemplateVersionSnapshot;
    actor: TemplateVersionActor;
  }): Promise<void>;
  recordIdempotentResult(key: string, result: T): Promise<void>;
};

export type VersionedMutationResult<T> =
  | { ok: true; template: T; replayed: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'VERSION_CONFLICT'; currentVersion?: number };

const SNAPSHOT_FIELDS = [
  'id', 'name', 'summary', 'description', 'category', 'workflowType', 'outputTypeId',
  'tags', 'scenarios', 'taxonomyReviewStatus', 'unmappedTerms', 'classificationMeta',
  'variables', 'promptTemplate', 'negativePrompt', 'coverObjectKey', 'coverUrl', 'status',
  'isFeatured', 'featuredOrder', 'isHot', 'source', 'sourceMeta', 'modelHints', 'locale',
  'i18n', 'publishedAt', 'currentVersion',
] as const;

export function buildTemplateVersionSnapshot(
  template: VersionedTemplate,
  semantic: SemanticClassification | null,
): TemplateVersionSnapshot {
  const snapshot: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) snapshot[field] = template[field] ?? null;
  snapshot.templateId = template.id;
  snapshot.version = template.currentVersion;
  snapshot.semantic = semantic;
  return snapshot as TemplateVersionSnapshot;
}

export async function recordInitialTemplateVersion<T extends VersionedTemplate>(
  repository: Pick<TemplateVersionRepository<T>, 'insertVersion'>,
  template: T,
  semantic: SemanticClassification | null,
  actor: TemplateVersionActor,
) {
  await repository.insertVersion({
    templateId: template.id,
    version: 1,
    snapshot: buildTemplateVersionSnapshot({ ...template, currentVersion: 1 }, semantic),
    actor,
  });
}

export async function updateTemplateWithVersion<T extends VersionedTemplate>(
  repository: TemplateVersionRepository<T>,
  input: {
    id: string;
    expectedVersion: number;
    idempotencyKey: string;
    patch: Partial<T>;
    semantic: SemanticClassification | null;
    actor: TemplateVersionActor;
  },
): Promise<VersionedMutationResult<T>> {
  const replay = await repository.findIdempotentResult(input.idempotencyKey);
  if (replay) return { ok: true, template: replay, replayed: true };

  const current = await repository.loadTemplate(input.id);
  if (!current) return { ok: false, code: 'NOT_FOUND' };
  if (current.currentVersion !== input.expectedVersion) {
    return { ok: false, code: 'VERSION_CONFLICT', currentVersion: current.currentVersion };
  }

  const updated = await repository.updateIfVersion(input.id, input.expectedVersion, input.patch);
  if (!updated) {
    const latest = await repository.loadTemplate(input.id);
    return { ok: false, code: 'VERSION_CONFLICT', currentVersion: latest?.currentVersion };
  }
  await repository.replaceSemantic?.(updated.id);
  await repository.insertVersion({
    templateId: updated.id,
    version: updated.currentVersion,
    snapshot: buildTemplateVersionSnapshot(updated, input.semantic),
    actor: input.actor,
  });
  await repository.recordIdempotentResult(input.idempotencyKey, updated);
  return { ok: true, template: updated, replayed: false };
}
