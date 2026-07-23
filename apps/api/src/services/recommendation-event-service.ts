import type { RecommendationEventInput } from '@promptix/shared';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  templateRecommendationEvents,
  templateRecommendationRequests,
} from '../db/schema.js';

type RecommendationSnapshotItem = {
  templateId: string;
  position: number;
};

type RecommendationRequestRecord = {
  id: string;
  sourceTemplateId: string;
  algorithmVersion: string;
  candidateIds: string[];
  scoreSnapshot: unknown;
  createdAt: Date;
  expiresAt: Date;
};

type ClientEventInsert = {
  requestId: string;
  sourceTemplateId: string;
  recommendedTemplateId: string;
  eventType: RecommendationEventInput['eventType'];
  position: number;
  dedupeKey: string;
};

export type RecommendationEventRepository = {
  findRequest(requestId: string): Promise<RecommendationRequestRecord | null>;
  insertEvent(input: ClientEventInsert): Promise<boolean>;
};

export type RecordClientRecommendationEventInput =
  RecommendationEventInput & { sourceTemplateId: string };

function snapshotItems(value: unknown): RecommendationSnapshotItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecommendationSnapshotItem =>
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as RecommendationSnapshotItem).templateId === 'string' &&
    Number.isInteger((item as RecommendationSnapshotItem).position));
}

export function createRecommendationEventService(
  repository: RecommendationEventRepository,
  now: () => Date = () => new Date(),
) {
  return async function recordClientRecommendationEvent(
    input: RecordClientRecommendationEventInput,
  ): Promise<
    { ok: true; recorded: boolean } |
    { ok: false; reason: string }
  > {
    const request = await repository.findRequest(input.requestId);
    if (!request) return { ok: false, reason: 'Recommendation request not found' };
    if (request.sourceTemplateId !== input.sourceTemplateId) {
      return { ok: false, reason: 'Recommendation source does not match' };
    }
    if (request.expiresAt.getTime() <= now().getTime()) {
      return { ok: false, reason: 'Recommendation request has expired' };
    }
    if (!request.candidateIds.includes(input.recommendedTemplateId)) {
      return { ok: false, reason: 'Recommended template is not in this request' };
    }

    const snapshot = snapshotItems(request.scoreSnapshot)
      .find((item) => item.templateId === input.recommendedTemplateId);
    if (!snapshot || snapshot.position < 1 || snapshot.position > 12) {
      return { ok: false, reason: 'Recommendation snapshot is invalid' };
    }

    const recorded = await repository.insertEvent({
      requestId: request.id,
      sourceTemplateId: request.sourceTemplateId,
      recommendedTemplateId: input.recommendedTemplateId,
      eventType: input.eventType,
      position: snapshot.position,
      dedupeKey:
        `${input.eventType}:${request.id}:${input.recommendedTemplateId}`,
    });
    return { ok: true, recorded };
  };
}

const databaseRepository: RecommendationEventRepository = {
  async findRequest(requestId) {
    const [request] = await getDb().select().from(templateRecommendationRequests)
      .where(eq(templateRecommendationRequests.id, requestId))
      .limit(1);
    return request ?? null;
  },

  async insertEvent(input) {
    const [inserted] = await getDb().insert(templateRecommendationEvents)
      .values(input)
      .onConflictDoNothing({
        target: templateRecommendationEvents.dedupeKey,
      })
      .returning({ id: templateRecommendationEvents.id });
    return Boolean(inserted);
  },
};

export const recordClientRecommendationEvent =
  createRecommendationEventService(databaseRepository);
