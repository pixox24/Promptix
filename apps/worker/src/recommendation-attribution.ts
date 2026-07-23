import { eq } from 'drizzle-orm';

type RecommendationRequest = {
  id: string;
  sourceTemplateId: string;
  candidateIds: string[];
  scoreSnapshot: unknown;
};

type GenerationSuccessInsert = {
  requestId: string;
  sourceTemplateId: string;
  recommendedTemplateId: string;
  eventType: 'generation_succeeded';
  position: number;
  generationJobId: string;
  dedupeKey: string;
};

export type RecommendationAttributionRepository = {
  findRequest(requestId: string): Promise<RecommendationRequest | null>;
  insertSuccess(input: GenerationSuccessInsert): Promise<boolean>;
};

export type RecommendationGenerationSuccessInput = {
  jobId: string;
  templateId: string;
  recommendationRequestId?: string;
};

function findPosition(snapshot: unknown, templateId: string) {
  if (!Array.isArray(snapshot)) return null;
  const item = snapshot.find((candidate) =>
    candidate &&
    typeof candidate === 'object' &&
    (candidate as { templateId?: unknown }).templateId === templateId);
  const position = (item as { position?: unknown } | undefined)?.position;
  return Number.isInteger(position) && Number(position) >= 1 && Number(position) <= 12
    ? Number(position)
    : null;
}

export function createRecommendationAttributionService(
  repository: RecommendationAttributionRepository,
) {
  return async function recordRecommendationGenerationSuccess({
    jobId,
    templateId,
    recommendationRequestId,
  }: RecommendationGenerationSuccessInput) {
    if (!recommendationRequestId) return false;
    const request = await repository.findRequest(recommendationRequestId);
    if (!request || !request.candidateIds.includes(templateId)) return false;
    const position = findPosition(request.scoreSnapshot, templateId);
    if (!position) return false;

    return repository.insertSuccess({
      requestId: request.id,
      sourceTemplateId: request.sourceTemplateId,
      recommendedTemplateId: templateId,
      eventType: 'generation_succeeded',
      position,
      generationJobId: jobId,
      dedupeKey: `generation:${jobId}`,
    });
  };
}

const databaseRepository: RecommendationAttributionRepository = {
  async findRequest(requestId) {
    const {
      db,
      templateRecommendationRequests,
    } = await import('./db.js');
    const [request] = await db.select().from(templateRecommendationRequests)
      .where(eq(templateRecommendationRequests.id, requestId))
      .limit(1);
    return request ?? null;
  },

  async insertSuccess(input) {
    const {
      db,
      templateRecommendationEvents,
    } = await import('./db.js');
    const [inserted] = await db.insert(templateRecommendationEvents)
      .values(input)
      .onConflictDoNothing({
        target: templateRecommendationEvents.dedupeKey,
      })
      .returning({ id: templateRecommendationEvents.id });
    return Boolean(inserted);
  },
};

export const recordRecommendationGenerationSuccess =
  createRecommendationAttributionService(databaseRepository);

export async function recordRecommendationGenerationSuccessSafely(
  input: RecommendationGenerationSuccessInput,
  record: (
    value: RecommendationGenerationSuccessInput,
  ) => Promise<boolean> = recordRecommendationGenerationSuccess,
  onError: (error: unknown) => void = (error) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'recommendation_attribution_failed',
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    }));
  },
) {
  try {
    return await record(input);
  } catch (error) {
    onError(error);
    return false;
  }
}
