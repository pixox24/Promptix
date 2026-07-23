import type { SemanticClassification } from '@promptix/shared';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  promptTemplates,
  taxonomyTerms,
  templateTaxonomyAssignments,
} from '../db/schema.js';

export type TemplateSemanticView = SemanticClassification;

export async function loadTemplateSemanticViews(
  rows: Array<typeof promptTemplates.$inferSelect>,
): Promise<Map<string, TemplateSemanticView>> {
  if (!rows.length) return new Map();

  const templateIds = rows.map((row) => row.id);
  const outputTypeIds = rows
    .map((row) => row.outputTypeId)
    .filter((id): id is string => Boolean(id));
  const [assignments, outputTerms] = await Promise.all([
    getDb()
      .select({
        templateId: templateTaxonomyAssignments.templateId,
        term: taxonomyTerms,
      })
      .from(templateTaxonomyAssignments)
      .innerJoin(
        taxonomyTerms,
        eq(templateTaxonomyAssignments.termId, taxonomyTerms.id),
      )
      .where(inArray(templateTaxonomyAssignments.templateId, templateIds)),
    outputTypeIds.length
      ? getDb().select().from(taxonomyTerms).where(inArray(taxonomyTerms.id, outputTypeIds))
      : Promise.resolve([]),
  ]);

  const outputById = new Map(outputTerms.map((term) => [term.id, term.slug]));
  const assignmentsByTemplate =
    new Map<string, Array<typeof taxonomyTerms.$inferSelect>>();
  for (const assignment of assignments) {
    const list = assignmentsByTemplate.get(assignment.templateId) ?? [];
    list.push(assignment.term);
    assignmentsByTemplate.set(assignment.templateId, list);
  }

  return new Map(rows.map((row) => {
    const terms = assignmentsByTemplate.get(row.id) ?? [];
    const meta = row.classificationMeta && typeof row.classificationMeta === 'object'
      ? row.classificationMeta as { confidence?: SemanticClassification['confidence'] }
      : undefined;
    return [row.id, {
      workflowType: row.workflowType as SemanticClassification['workflowType'],
      outputType: row.outputTypeId ? outputById.get(row.outputTypeId) ?? null : null,
      scenarios: terms
        .filter((term) => term.dimension === 'scenario')
        .map((term) => term.slug),
      styles: terms
        .filter((term) => term.dimension === 'style')
        .map((term) => term.slug),
      subjects: terms
        .filter((term) => term.dimension === 'subject')
        .map((term) => term.slug),
      tags: row.tags,
      unmappedTerms: Array.isArray(row.unmappedTerms)
        ? row.unmappedTerms as SemanticClassification['unmappedTerms']
        : [],
      confidence: meta?.confidence ?? {},
    } satisfies TemplateSemanticView];
  }));
}
