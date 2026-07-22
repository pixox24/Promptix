import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  governanceTemplateQuerySchema,
  taxonomySlugSchema,
  type GovernanceQueueId,
  type GovernanceTemplateQuery,
} from '@promptix/shared';
import { governanceProposals, promptTemplates, taxonomyTerms, templateTaxonomyAssignments } from '../db/schema.js';

export class GovernanceQueryValidationError extends Error {
  code = 'INVALID_GOVERNANCE_QUERY' as const;
}

export type GovernancePageQuery = {
  query: GovernanceTemplateQuery;
  pageSize: number;
  cursor?: GovernanceCursor;
};

export type GovernanceCursor =
  | { updatedAt: string; id: string }
  | { version: 2; sort: GovernanceTemplateQuery['sort']; fingerprint: string; key: string | number; id: string };

const csv = (value: string | undefined) => value
  ? [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
  : [];

export function encodeGovernanceCursor(value: GovernanceCursor) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeGovernanceCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.id !== 'string' || !parsed.id) throw new Error();
    if (parsed.version === 2) {
      if (!['updated_desc', 'updated_asc', 'quality_asc', 'confidence_desc'].includes(String(parsed.sort)) || typeof parsed.fingerprint !== 'string' || (typeof parsed.key !== 'string' && typeof parsed.key !== 'number')) throw new Error();
      return { version: 2 as const, sort: parsed.sort as GovernanceTemplateQuery['sort'], fingerprint: parsed.fingerprint, key: parsed.key, id: parsed.id };
    }
    if (typeof parsed.updatedAt !== 'string' || Number.isNaN(Date.parse(parsed.updatedAt))) throw new Error();
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw new GovernanceQueryValidationError('Invalid cursor');
  }
}

export function governanceQueryFingerprint(query: GovernanceTemplateQuery) {
  return Buffer.from(JSON.stringify(query, Object.keys(query).sort())).toString('base64url');
}

export function governanceSortKey(row: { updatedAt: Date; coverUrl: string | null; summary: string; classificationMeta?: unknown }, sort: GovernanceTemplateQuery['sort']): string | number {
  if (sort === 'updated_desc' || sort === 'updated_asc') return row.updatedAt.toISOString();
  if (sort === 'quality_asc') return row.coverUrl == null ? 0 : row.summary === '' ? 1 : 2;
  const meta = row.classificationMeta && typeof row.classificationMeta === 'object' ? row.classificationMeta as { confidence?: { outputType?: unknown } } : {};
  const value = Number(meta.confidence?.outputType ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function parseGovernancePageQuery(params: URLSearchParams): GovernancePageQuery {
  const pageSize = Number(params.get('pageSize') ?? 50);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new GovernanceQueryValidationError('pageSize must be between 1 and 100');
  }
  const parsed = governanceTemplateQuerySchema.safeParse({
    queue: params.get('queue') || undefined,
    q: params.get('q') || undefined,
    source: params.get('source') || undefined,
    lifecycle: params.get('lifecycle') || undefined,
    outputType: params.get('outputType') || undefined,
    scenarios: csv(params.get('scenarios') || undefined),
    styles: csv(params.get('styles') || undefined),
    subjects: csv(params.get('subjects') || undefined),
    quality: params.get('quality') || undefined,
    agentStatus: params.get('agentStatus') || undefined,
    updatedAfter: params.get('updatedAfter') || undefined,
    updatedBefore: params.get('updatedBefore') || undefined,
    sort: params.get('sort') || undefined,
  });
  if (!parsed.success) throw new GovernanceQueryValidationError(parsed.error.issues[0]?.message ?? 'Invalid governance query');
  const taxonomyValues = [parsed.data.outputType, ...parsed.data.scenarios, ...parsed.data.styles, ...parsed.data.subjects].filter((value): value is string => Boolean(value));
  if (taxonomyValues.some((value) => !taxonomySlugSchema.safeParse(value).success)) {
    throw new GovernanceQueryValidationError('Invalid taxonomy value');
  }
  return { query: parsed.data, pageSize, cursor: decodeGovernanceCursor(params.get('cursor') || undefined) };
}

function taxonomyExists(dimension: 'scenario' | 'style' | 'subject', slugs: string[]) {
  return sql`exists (select 1 from ${templateTaxonomyAssignments}
    inner join ${taxonomyTerms} on ${templateTaxonomyAssignments.termId} = ${taxonomyTerms.id}
    where ${templateTaxonomyAssignments.templateId} = ${promptTemplates.id}
      and ${taxonomyTerms.dimension} = ${dimension}
      and ${taxonomyTerms.slug} in (${sql.join(slugs.map((slug) => sql`${slug}`), sql`, `)}))`;
}

export function governanceQueuePredicate(queue: GovernanceQueueId): SQL {
  switch (queue) {
    case 'taxonomy_confirmation': return sql`${promptTemplates.taxonomyReviewStatus} <> 'reviewed'`;
    case 'duplicate_candidates': return sql`exists (
      select 1 from governance_change_set_items i join governance_proposals p on p.id = i.proposal_id
      where p.template_id = ${promptTemplates.id}
        and i.id = (select i2.id from governance_change_set_items i2 join governance_proposals p2 on p2.id = i2.proposal_id where p2.template_id = ${promptTemplates.id} order by p2.created_at desc, i2.id desc limit 1)
        and i.status in ('pending','awaiting_approval','queued','running')
        and 'DUPLICATE_CANDIDATE' = any(p.reason_codes)
    )`;
    case 'quality_issues': return or(eq(promptTemplates.summary, ''), sql`${promptTemplates.coverUrl} is null`, sql`length(${promptTemplates.promptTemplate}) < 20`)!;
    case 'featured_candidates': return and(eq(promptTemplates.status, 'published'), eq(promptTemplates.isFeatured, false), sql`${promptTemplates.coverUrl} is not null`, eq(promptTemplates.taxonomyReviewStatus, 'reviewed'))!;
    case 'pending_approval': return sql`exists (
      select 1 from governance_change_set_items i join governance_proposals p on p.id = i.proposal_id
      where p.template_id = ${promptTemplates.id}
        and i.id = (select i2.id from governance_change_set_items i2 join governance_proposals p2 on p2.id = i2.proposal_id where p2.template_id = ${promptTemplates.id} order by p2.created_at desc, i2.id desc limit 1)
        and i.status = 'awaiting_approval'
    )`;
    case 'failed_items': return sql`exists (
      select 1 from governance_change_set_items i join governance_proposals p on p.id = i.proposal_id
      where p.template_id = ${promptTemplates.id}
        and i.id = (select i2.id from governance_change_set_items i2 join governance_proposals p2 on p2.id = i2.proposal_id where p2.template_id = ${promptTemplates.id} order by p2.created_at desc, i2.id desc limit 1)
        and i.status in ('failed','conflict')
    )`;
  }
}

export function buildGovernanceFilters(query: GovernanceTemplateQuery): SQL[] {
  const filters: SQL[] = [isNull(promptTemplates.deletedAt)];
  if (query.queue) filters.push(governanceQueuePredicate(query.queue));
  if (query.q) filters.push(or(ilike(promptTemplates.name, `%${query.q}%`), ilike(promptTemplates.summary, `%${query.q}%`), ilike(promptTemplates.promptTemplate, `%${query.q}%`))!);
  if (query.source) filters.push(eq(promptTemplates.source, query.source));
  if (query.lifecycle) filters.push(eq(promptTemplates.status, query.lifecycle));
  if (query.outputType) filters.push(sql`exists (select 1 from ${taxonomyTerms} where ${taxonomyTerms.id} = ${promptTemplates.outputTypeId} and ${taxonomyTerms.slug} = ${query.outputType})`);
  if (query.scenarios.length) filters.push(taxonomyExists('scenario', query.scenarios));
  if (query.styles.length) filters.push(taxonomyExists('style', query.styles));
  if (query.subjects.length) filters.push(taxonomyExists('subject', query.subjects));
  if (query.quality === 'critical') filters.push(and(eq(promptTemplates.status, 'published'), sql`${promptTemplates.coverUrl} is null`)!);
  if (query.quality === 'attention') filters.push(or(eq(promptTemplates.summary, ''), sql`length(${promptTemplates.promptTemplate}) < 20`, sql`${promptTemplates.taxonomyReviewStatus} <> 'reviewed'`)!);
  if (query.quality === 'good') filters.push(and(sql`${promptTemplates.summary} <> ''`, sql`length(${promptTemplates.promptTemplate}) >= 20`, eq(promptTemplates.taxonomyReviewStatus, 'reviewed'))!);
  if (query.agentStatus) filters.push(sql`exists (select 1 from ${governanceProposals} where ${governanceProposals.templateId} = ${promptTemplates.id} and ${governanceProposals.status} = ${query.agentStatus})`);
  if (query.updatedAfter) filters.push(sql`${promptTemplates.updatedAt} >= ${new Date(query.updatedAfter)}`);
  if (query.updatedBefore) filters.push(sql`${promptTemplates.updatedAt} <= ${new Date(query.updatedBefore)}`);
  return filters;
}

export function governanceOrder(query: GovernanceTemplateQuery) {
  if (query.sort === 'updated_asc') return [asc(promptTemplates.updatedAt), asc(promptTemplates.id)] as const;
  if (query.sort === 'quality_asc') return [asc(sql`case when ${promptTemplates.coverUrl} is null then 0 when ${promptTemplates.summary} = '' then 1 else 2 end`), asc(promptTemplates.id)] as const;
  if (query.sort === 'confidence_desc') return [desc(sql`coalesce((${promptTemplates.classificationMeta}->'confidence'->>'outputType')::numeric, 0)`), asc(promptTemplates.id)] as const;
  return [desc(promptTemplates.updatedAt), desc(promptTemplates.id)] as const;
}
