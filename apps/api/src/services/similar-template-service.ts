import type {
  PublicTemplate,
  SimilarTemplateResponse,
} from '@promptix/shared';
import { and, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  promptTemplates,
  templateRecommendationEvents,
  templateRecommendationRequests,
} from '../db/schema.js';
import {
  rankSimilarTemplates,
  type RecommendationFeedback,
} from '../lib/similar-template-ranking.js';
import { loadTemplateSemanticViews } from '../lib/template-semantics.js';

const ALGORITHM_VERSION = 'similar-v1' as const;
const REQUEST_TTL_MS = 4 * 60 * 60 * 1_000;
const FEEDBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

type ScoreSnapshotItem = {
  templateId: string;
  score: number;
  contentScore: number;
  position: number;
  reasonCodes: string[];
  reasonLabel: string;
};

export type PersistRecommendationRequestInput = {
  sourceTemplateId: string;
  algorithmVersion: typeof ALGORITHM_VERSION;
  candidateIds: string[];
  scoreSnapshot: ScoreSnapshotItem[];
  createdAt: Date;
  expiresAt: Date;
};

export type SimilarTemplateRepository = {
  findSource(sourceId: string): Promise<PublicTemplate | null>;
  findCandidates(source: PublicTemplate): Promise<PublicTemplate[]>;
  loadFeedback(
    sourceId: string,
    candidateIds: string[],
    since: Date,
  ): Promise<Map<string, RecommendationFeedback>>;
  persistRequest(input: PersistRecommendationRequestInput): Promise<string>;
};

export function createSimilarTemplateService(
  repository: SimilarTemplateRepository,
  now: () => Date = () => new Date(),
) {
  return async function getSimilarTemplateResponse(
    sourceId: string,
    limit: number,
  ): Promise<SimilarTemplateResponse | null> {
    const source = await repository.findSource(sourceId);
    if (!source) return null;

    const candidates = await repository.findCandidates(source);
    const currentTime = now();
    const feedback = await repository.loadFeedback(
      source.id,
      candidates.map((candidate) => candidate.id),
      new Date(currentTime.getTime() - FEEDBACK_WINDOW_MS),
    );
    const ranked = rankSimilarTemplates({
      source,
      candidates,
      feedback,
      now: currentTime,
      limit,
    });
    const scoreSnapshot = ranked.map((item, index) => ({
      templateId: item.template.id,
      score: item.score,
      contentScore: item.contentScore,
      position: index + 1,
      reasonCodes: item.reasonCodes,
      reasonLabel: item.reasonLabel,
    }));
    const requestId = await repository.persistRequest({
      sourceTemplateId: source.id,
      algorithmVersion: ALGORITHM_VERSION,
      candidateIds: scoreSnapshot.map((item) => item.templateId),
      scoreSnapshot,
      createdAt: currentTime,
      expiresAt: new Date(currentTime.getTime() + REQUEST_TTL_MS),
    });

    return {
      requestId,
      algorithmVersion: ALGORITHM_VERSION,
      items: ranked.map((item, index) => ({
        template: item.template,
        score: item.score,
        position: index + 1,
        reasonCodes: item.reasonCodes,
        reasonLabel: item.reasonLabel,
      })),
    };
  };
}

function publicTemplate(
  row: typeof promptTemplates.$inferSelect,
  semantic: PublicTemplate['semantic'],
): PublicTemplate {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    description: row.description,
    coverImage: row.coverUrl ?? '',
    category: row.category as PublicTemplate['category'],
    tags: row.tags,
    semantic,
    variables: row.variables as PublicTemplate['variables'],
    promptTemplate: row.promptTemplate,
    negativePrompt: row.negativePrompt,
    scenarios: row.scenarios,
    isFeatured: row.isFeatured,
    featuredOrder: row.featuredOrder,
    isHot: row.isHot,
    favoriteCount: row.favoriteCount,
    useCount: row.useCount,
    createdAt: row.createdAt.toISOString(),
    locale: row.locale,
  };
}

const databaseRepository: SimilarTemplateRepository = {
  async findSource(sourceId) {
    const [row] = await getDb().select().from(promptTemplates).where(and(
      eq(promptTemplates.id, sourceId),
      eq(promptTemplates.status, 'published'),
      isNull(promptTemplates.deletedAt),
    )).limit(1);
    if (!row) return null;
    const semantics = await loadTemplateSemanticViews([row]);
    return publicTemplate(row, semantics.get(row.id));
  },

  async findCandidates(source) {
    const rows = await getDb().select().from(promptTemplates).where(and(
      eq(promptTemplates.status, 'published'),
      isNull(promptTemplates.deletedAt),
      ne(promptTemplates.id, source.id),
      eq(promptTemplates.workflowType, source.semantic?.workflowType ?? 'generate'),
    )).limit(200);
    const semantics = await loadTemplateSemanticViews(rows);
    return rows.map((row) => publicTemplate(row, semantics.get(row.id)));
  },

  async loadFeedback(sourceId, candidateIds, since) {
    if (!candidateIds.length) return new Map();
    const rows = await getDb().select({
      recommendedTemplateId: templateRecommendationEvents.recommendedTemplateId,
      impressions: sql<number>`count(*) filter (where ${templateRecommendationEvents.eventType} = 'impression')::int`,
      clicks: sql<number>`count(*) filter (where ${templateRecommendationEvents.eventType} = 'click')::int`,
      successes: sql<number>`count(*) filter (where ${templateRecommendationEvents.eventType} = 'generation_succeeded')::int`,
    }).from(templateRecommendationEvents).where(and(
      eq(templateRecommendationEvents.sourceTemplateId, sourceId),
      inArray(templateRecommendationEvents.recommendedTemplateId, candidateIds),
      gte(templateRecommendationEvents.createdAt, since),
    )).groupBy(templateRecommendationEvents.recommendedTemplateId);
    return new Map(rows.map((row) => [row.recommendedTemplateId, {
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
      successes: Number(row.successes),
    }]));
  },

  async persistRequest(input) {
    const [row] = await getDb().insert(templateRecommendationRequests).values(input)
      .returning({ id: templateRecommendationRequests.id });
    if (!row) throw new Error('Failed to persist recommendation request');
    return row.id;
  },
};

export const getSimilarTemplateResponse =
  createSimilarTemplateService(databaseRepository);

