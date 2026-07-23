import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { templateRecommendationEvents } from '../db/schema.js';

export type RecommendationPositionMetric = {
  position: number;
  impressions: number;
  clicks: number;
  generationSuccesses: number;
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function summarizeRecommendationMetrics(
  rows: RecommendationPositionMetric[],
  days: number,
) {
  const positions = rows.map((row) => ({
    ...row,
    ctr: ratio(row.clicks, row.impressions),
    cvr: ratio(row.generationSuccesses, row.clicks),
  }));
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const generationSuccesses =
    rows.reduce((sum, row) => sum + row.generationSuccesses, 0);
  return {
    days,
    impressions,
    clicks,
    generationSuccesses,
    ctr: ratio(clicks, impressions),
    cvr: ratio(generationSuccesses, clicks),
    positions,
  };
}

export async function getRecommendationMetrics(
  sourceTemplateId: string,
  days: number,
) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
  const rows = await getDb().select({
    position: templateRecommendationEvents.position,
    impressions: sql<number>`count(distinct (${templateRecommendationEvents.requestId}, ${templateRecommendationEvents.recommendedTemplateId})) filter (where ${templateRecommendationEvents.eventType} = 'impression')::int`,
    clicks: sql<number>`count(distinct (${templateRecommendationEvents.requestId}, ${templateRecommendationEvents.recommendedTemplateId})) filter (where ${templateRecommendationEvents.eventType} = 'click')::int`,
    generationSuccesses: sql<number>`count(*) filter (where ${templateRecommendationEvents.eventType} = 'generation_succeeded')::int`,
  }).from(templateRecommendationEvents).where(and(
    eq(templateRecommendationEvents.sourceTemplateId, sourceTemplateId),
    gte(templateRecommendationEvents.createdAt, since),
  )).groupBy(templateRecommendationEvents.position)
    .orderBy(templateRecommendationEvents.position);

  return summarizeRecommendationMetrics(rows.map((row) => ({
    position: row.position,
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    generationSuccesses: Number(row.generationSuccesses),
  })), days);
}

