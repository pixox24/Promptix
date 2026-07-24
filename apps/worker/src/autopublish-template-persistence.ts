import { and, eq, inArray } from 'drizzle-orm';
import { templateDraftSchema, type TemplateDraft, type TaxonomyDimension } from '@promptix/shared';
import { db, governanceAuditEvents, promptTemplates, taxonomyTerms, templateAutopublishRuns, templateTaxonomyAssignments, templateVersions } from './db.js';

type TaxonomyTerm = { id: string; dimension: string; slug: string };
type PersistenceInput = {
  runId: string; agentId: string | null; modelId: string; promptVersion: string;
  taxonomySnapshotHash: string; evidenceArtifactId: string;
  draft: TemplateDraft | unknown; taxonomyTerms: TaxonomyTerm[];
};
type PreparedPersistence = {
  template: Record<string, unknown>; version: Record<string, unknown>;
  assignments: Array<{ templateId: string; termId: string; source: 'ai'; confidence: string | null }>;
  audit: Record<string, unknown>;
};
export type AutopublishTemplateRepository = {
  persist(input: PreparedPersistence): Promise<Record<string, unknown>>;
};

function expectedTaxonomy(draft: TemplateDraft) {
  return [
    ['output_type', draft.semantic.outputType],
    ...draft.semantic.scenarios.map((slug) => ['scenario', slug]),
    ...draft.semantic.styles.map((slug) => ['style', slug]),
    ...draft.semantic.subjects.map((slug) => ['subject', slug]),
  ].filter((entry): entry is [TaxonomyDimension, string] => Boolean(entry[1]));
}

export async function persistAutopublishDraft(value: PersistenceInput, repository: AutopublishTemplateRepository) {
  const draft = templateDraftSchema.parse(value.draft);
  const terms = new Map(value.taxonomyTerms.map((term) => [`${term.dimension}:${term.slug}`, term]));
  const requestedTerms = expectedTaxonomy(draft);
  if (requestedTerms.some(([dimension, slug]) => !terms.has(`${dimension}:${slug}`))) {
    throw new Error('AUTOPUBLISH_TAXONOMY_SNAPSHOT_CHANGED');
  }
  const templateId = `tpl-auto-${value.runId.replace(/-/g, '').slice(0, 16)}`;
  const verifiedAt = new Date().toISOString();
  const autoVerification = {
    runId: value.runId, agentId: value.agentId, modelId: value.modelId,
    promptVersion: value.promptVersion, taxonomySnapshotHash: value.taxonomySnapshotHash,
    evidenceArtifactId: value.evidenceArtifactId, verifiedAt,
  };
  const template = {
    id: templateId, name: draft.name, summary: draft.summary, description: draft.description,
    category: draft.semantic.outputType === 'portrait' ? 'portrait' : 'illustration',
    workflowType: draft.semantic.workflowType, tags: draft.semantic.tags,
    scenarios: draft.semantic.scenarios, taxonomyReviewStatus: 'auto_verified',
    taxonomyReviewedAt: new Date(verifiedAt), taxonomyReviewedBy: null, unmappedTerms: [],
    classificationMeta: { semantic: draft.semantic, autoVerification },
    variables: draft.variables, promptTemplate: draft.promptTemplate,
    negativePrompt: draft.negativePrompt ?? null, status: 'draft',
    isFeatured: false, featuredOrder: 0, isHot: false,
    source: draft.semantic.workflowType === 'edit' ? 'image_reverse' : 'text_expand',
    sourceMeta: { autopublishRunId: value.runId }, locale: 'zh-CN',
    currentVersion: 1, useCount: 0, updatedAt: new Date(verifiedAt),
  };
  const confidenceKey = (dimension: TaxonomyDimension) =>
    dimension === 'output_type' ? 'outputType' as const
      : dimension === 'scenario' ? 'scenarios' as const
        : dimension === 'style' ? 'styles' as const : 'subjects' as const;
  const assignments = requestedTerms.map(([dimension, slug]) => ({
    templateId, termId: terms.get(`${dimension}:${slug}`)!.id, source: 'ai' as const,
    confidence: String(draft.semantic.confidence[confidenceKey(dimension)] ?? ''),
  }));
  return repository.persist({
    template, assignments,
    version: { templateId, version: 1, snapshot: { ...template, semantic: draft.semantic }, source: 'agent', runId: value.runId },
    audit: { actorType: 'agent', actorId: null, eventType: 'template.autopublish_draft_created', targetType: 'template', targetId: templateId, payload: { autoVerification } },
  });
}

export async function persistAutopublishDraftInDatabase(input: Omit<PersistenceInput, 'taxonomyTerms'>) {
  const draft = templateDraftSchema.parse(input.draft);
  const requested = expectedTaxonomy(draft);
  const rows = await db.select().from(taxonomyTerms).where(and(
    eq(taxonomyTerms.enabled, true), inArray(taxonomyTerms.slug, requested.map(([, slug]) => slug)),
  ));
  return persistAutopublishDraft({ ...input, draft, taxonomyTerms: rows }, {
    async persist(prepared) {
      return db.transaction(async (tx) => {
        const [run] = await tx.select().from(templateAutopublishRuns).where(eq(templateAutopublishRuns.id, input.runId)).limit(1);
        if (!run || run.currentStage !== 'creating_template') throw new Error('AUTOPUBLISH_STAGE_CONFLICT');
        const [created] = await tx.insert(promptTemplates).values(prepared.template as never).returning();
        await tx.insert(templateTaxonomyAssignments).values(prepared.assignments);
        await tx.insert(templateVersions).values(prepared.version as never);
        await tx.update(templateAutopublishRuns).set({ templateId: created.id }).where(eq(templateAutopublishRuns.id, input.runId));
        await tx.insert(governanceAuditEvents).values(prepared.audit as never);
        return created;
      });
    },
  });
}
