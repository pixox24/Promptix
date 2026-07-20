import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  semanticClassificationSchema,
  type SemanticClassification,
  type TaxonomyDimension,
} from '@promptix/shared';
import { getDb } from '../db/client.js';
import { taxonomyTerms } from '../db/schema.js';

export type TaxonomyTermRow = typeof taxonomyTerms.$inferSelect;

export type TaxonomySnapshot = {
  version: 1;
  terms: Array<{
    dimension: TaxonomyDimension;
    slug: string;
    label: string;
    aliases: string[];
  }>;
};

export class TaxonomyValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function listTaxonomyTerms(options: {
  dimension?: TaxonomyDimension;
  includeDisabled?: boolean;
} = {}) {
  const filters = [];
  if (options.dimension) filters.push(eq(taxonomyTerms.dimension, options.dimension));
  if (!options.includeDisabled) filters.push(eq(taxonomyTerms.enabled, true));
  return getDb().select().from(taxonomyTerms)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(taxonomyTerms.dimension), asc(taxonomyTerms.sortOrder), asc(taxonomyTerms.label));
}

export function taxonomySnapshotHash(snapshot: TaxonomySnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export async function loadActiveTaxonomySnapshot(): Promise<{
  snapshot: TaxonomySnapshot;
  hash: string;
}> {
  const rows = await listTaxonomyTerms();
  const snapshot: TaxonomySnapshot = {
    version: 1,
    terms: rows.map((row) => ({
      dimension: row.dimension as TaxonomyDimension,
      slug: row.slug,
      label: row.label,
      aliases: row.aliases,
    })),
  };
  return { snapshot, hash: taxonomySnapshotHash(snapshot) };
}

export async function resolveSemanticTerms(value: unknown) {
  const semantic = semanticClassificationSchema.parse(value);
  const slugsByDimension: Record<TaxonomyDimension, string[]> = {
    output_type: semantic.outputType ? [semantic.outputType] : [],
    scenario: semantic.scenarios,
    style: semantic.styles,
    subject: semantic.subjects,
  };
  const requested = [...new Set(Object.values(slugsByDimension).flat())];
  const rows = requested.length
    ? await getDb().select().from(taxonomyTerms).where(and(
      eq(taxonomyTerms.enabled, true),
      inArray(taxonomyTerms.slug, requested),
    ))
    : [];
  const byKey = new Map(rows.map((row) => [`${row.dimension}:${row.slug}`, row]));
  const missing: string[] = [];
  for (const [dimension, slugs] of Object.entries(slugsByDimension) as Array<[TaxonomyDimension, string[]]>) {
    for (const slug of slugs) {
      if (!byKey.has(`${dimension}:${slug}`)) missing.push(`${dimension}:${slug}`);
    }
  }
  if (missing.length) {
    throw new TaxonomyValidationError('TAXONOMY_TERM_NOT_FOUND', `Unknown or disabled taxonomy terms: ${missing.join(', ')}`);
  }
  return {
    semantic,
    outputType: semantic.outputType ? byKey.get(`output_type:${semantic.outputType}`)! : null,
    assignments: [
      ...semantic.scenarios.map((slug) => byKey.get(`scenario:${slug}`)!),
      ...semantic.styles.map((slug) => byKey.get(`style:${slug}`)!),
      ...semantic.subjects.map((slug) => byKey.get(`subject:${slug}`)!),
    ],
  };
}

export function assertConfirmableSemantic(semantic: SemanticClassification) {
  if (!semantic.outputType) {
    throw new TaxonomyValidationError('OUTPUT_TYPE_REQUIRED', '请选择产物类型');
  }
  if (!semantic.scenarios.length || !semantic.styles.length || !semantic.subjects.length) {
    throw new TaxonomyValidationError('TAXONOMY_FACETS_REQUIRED', '使用场景、风格和画面主体均至少选择一项');
  }
  if (semantic.unmappedTerms.length) {
    throw new TaxonomyValidationError('TAXONOMY_UNRESOLVED_TERMS', '请先处理全部待处理词');
  }
}

export function legacyCategoryForOutputType(outputType: string | null) {
  const map: Record<string, string> = {
    portrait: 'portrait', product_image: 'ecommerce', poster: 'poster', logo: 'logo',
    illustration: 'illustration', wallpaper: 'illustration', general_visual: 'illustration',
  };
  return outputType ? map[outputType] ?? 'illustration' : 'illustration';
}
