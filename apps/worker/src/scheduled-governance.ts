import { governanceRuleSetSchema, templateVersionSnapshotSchema } from '@promptix/shared';
import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, promptTemplates, taxonomyTerms, templateGovernanceState, templateTaxonomyAssignments } from './db.js';

export async function buildScheduledGovernanceInput(rulesValue: unknown, runId?: string) {
  const rules = governanceRuleSetSchema.parse(rulesValue);
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 15 * 60 * 1000);
  const candidates = await db.select({ template: promptTemplates }).from(promptTemplates)
    .leftJoin(templateGovernanceState, eq(templateGovernanceState.templateId, promptTemplates.id))
    .where(and(isNull(promptTemplates.deletedAt), or(isNull(templateGovernanceState.leaseUntil), lt(templateGovernanceState.leaseUntil, now))))
    .orderBy(asc(sql`coalesce(${templateGovernanceState.lastScanAt}, 'epoch'::timestamptz)`), asc(promptTemplates.updatedAt), asc(promptTemplates.id))
    .limit(rules.schedule.scanLimit * 2);
  const templates: Array<typeof promptTemplates.$inferSelect> = [];
  for (const { template } of candidates) {
    if (templates.length >= rules.schedule.scanLimit) break;
    const [claimed] = await db.insert(templateGovernanceState).values({ templateId: template.id, lastScanAt: now, leaseUntil, leaseToken: crypto.randomUUID(), lastRunId: runId, updatedAt: now })
      .onConflictDoUpdate({
        target: templateGovernanceState.templateId,
        set: { lastScanAt: now, leaseUntil, leaseToken: crypto.randomUUID(), lastRunId: runId, updatedAt: now },
        setWhere: or(isNull(templateGovernanceState.leaseUntil), lt(templateGovernanceState.leaseUntil, now)),
      }).returning({ templateId: templateGovernanceState.templateId });
    if (claimed) templates.push(template);
  }
  const ids = templates.map((template) => template.id);
  const [terms, assignmentRows] = await Promise.all([
    db.select().from(taxonomyTerms),
    ids.length
      ? db.select({
        templateId: templateTaxonomyAssignments.templateId,
        source: templateTaxonomyAssignments.source,
        confidence: templateTaxonomyAssignments.confidence,
        term: taxonomyTerms,
      }).from(templateTaxonomyAssignments)
        .innerJoin(taxonomyTerms, eq(templateTaxonomyAssignments.termId, taxonomyTerms.id))
        .where(inArray(templateTaxonomyAssignments.templateId, ids))
      : [],
  ]);
  const termById = new Map(terms.map((term) => [term.id, term]));
  const rowsByTemplate = new Map<string, typeof assignmentRows>();
  for (const row of assignmentRows) {
    const list = rowsByTemplate.get(row.templateId) ?? [];
    list.push(row);
    rowsByTemplate.set(row.templateId, list);
  }

  const snapshots = templates.map((template) => {
    const rows = rowsByTemplate.get(template.id) ?? [];
    const output = template.outputTypeId ? termById.get(template.outputTypeId) : null;
    const confidence = template.classificationMeta && typeof template.classificationMeta === 'object'
      ? (template.classificationMeta as { confidence?: unknown }).confidence ?? {}
      : {};
    const taxonomyAssignments = [
      ...(output ? [{ termId: output.id, slug: output.slug, dimension: output.dimension, source: 'migration' as const, confidence: null }] : []),
      ...rows.map((row) => ({
        termId: row.term.id,
        slug: row.term.slug,
        dimension: row.term.dimension,
        source: row.source as 'ai' | 'admin' | 'migration',
        confidence: row.confidence == null ? null : Number(row.confidence),
      })),
    ];
    return templateVersionSnapshotSchema.parse({
      snapshotSchemaVersion: 2,
      templateId: template.id,
      version: template.currentVersion,
      name: template.name,
      summary: template.summary,
      description: template.description,
      category: template.category,
      semantic: {
        workflowType: template.workflowType,
        outputType: output?.slug ?? null,
        scenarios: rows.filter((row) => row.term.dimension === 'scenario').map((row) => row.term.slug),
        styles: rows.filter((row) => row.term.dimension === 'style').map((row) => row.term.slug),
        subjects: rows.filter((row) => row.term.dimension === 'subject').map((row) => row.term.slug),
        tags: template.tags,
        unmappedTerms: template.unmappedTerms,
        confidence,
      },
      variables: template.variables,
      promptTemplate: template.promptTemplate,
      negativePrompt: template.negativePrompt,
      coverObjectKey: template.coverObjectKey,
      coverUrl: template.coverUrl,
      status: template.status,
      publishedAt: template.publishedAt?.toISOString() ?? null,
      source: template.source,
      isFeatured: template.isFeatured,
      featuredOrder: template.featuredOrder,
      locale: template.locale,
      taxonomyAssignments,
      taxonomyReviewedAt: template.taxonomyReviewedAt?.toISOString() ?? null,
      taxonomyReviewedBy: template.taxonomyReviewedBy,
      taxonomyReviewStatus: template.taxonomyReviewStatus,
    });
  });
  const agent = (rules as { agent?: { promptVersion?: string; systemPrompt?: string } }).agent ?? {};
  return {
    goal: 'Scheduled template governance patrol',
    promptVersion: agent.promptVersion,
    systemPrompt: agent.systemPrompt,
    snapshots,
    taxonomyCatalog: terms.filter((term) => term.enabled).map((term) => ({ slug: term.slug })),
    rules,
  };
}

export async function releaseScheduledGovernanceLease(runId: string) {
  await db.update(templateGovernanceState).set({ leaseUntil: null, leaseToken: null, updatedAt: new Date() }).where(eq(templateGovernanceState.lastRunId, runId));
}
