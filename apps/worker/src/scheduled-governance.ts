import { governanceRuleSetSchema, templateVersionSnapshotSchema } from '@promptix/shared';
import { eq, inArray } from 'drizzle-orm';
import { db, promptTemplates, taxonomyTerms, templateTaxonomyAssignments } from './db.js';

export async function buildScheduledGovernanceInput(rulesValue: unknown) {
  const rules = governanceRuleSetSchema.parse(rulesValue);
  const templates = await db.select().from(promptTemplates).limit(rules.schedule.scanLimit);
  const ids = templates.map((template) => template.id); const outputIds = templates.map((template) => template.outputTypeId).filter((id): id is string => Boolean(id));
  const [terms, assignments] = await Promise.all([
    db.select().from(taxonomyTerms),
    ids.length ? db.select({ templateId: templateTaxonomyAssignments.templateId, term: taxonomyTerms }).from(templateTaxonomyAssignments).innerJoin(taxonomyTerms, eq(templateTaxonomyAssignments.termId, taxonomyTerms.id)).where(inArray(templateTaxonomyAssignments.templateId, ids)) : [],
  ]);
  const outputById = new Map(terms.filter((term) => outputIds.includes(term.id)).map((term) => [term.id, term.slug]));
  const assigned = new Map<string, typeof terms>(); for (const row of assignments) { const list = assigned.get(row.templateId) ?? []; list.push(row.term); assigned.set(row.templateId, list); }
  const snapshots = templates.map((template) => {
    const list = assigned.get(template.id) ?? []; const confidence = template.classificationMeta && typeof template.classificationMeta === 'object' ? (template.classificationMeta as { confidence?: unknown }).confidence ?? {} : {};
    return templateVersionSnapshotSchema.parse({ templateId: template.id, version: template.currentVersion, name: template.name, summary: template.summary, description: template.description, semantic: { workflowType: template.workflowType, outputType: template.outputTypeId ? outputById.get(template.outputTypeId) ?? null : null, scenarios: list.filter((term) => term.dimension === 'scenario').map((term) => term.slug), styles: list.filter((term) => term.dimension === 'style').map((term) => term.slug), subjects: list.filter((term) => term.dimension === 'subject').map((term) => term.slug), tags: template.tags, unmappedTerms: template.unmappedTerms, confidence }, variables: template.variables, promptTemplate: template.promptTemplate, negativePrompt: template.negativePrompt, coverObjectKey: template.coverObjectKey, coverUrl: template.coverUrl, status: template.status, source: template.source, isFeatured: template.isFeatured, featuredOrder: template.featuredOrder, locale: template.locale });
  });
  return { snapshots, taxonomyCatalog: terms.map((term) => ({ slug: term.slug })), rules, signals: [] };
}
