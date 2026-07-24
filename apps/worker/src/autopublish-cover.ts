import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db, generationJobs, mediaObjects } from './db.js';
import { deleteObject } from '@promptix/storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_MS = 7 * DAY_MS;
type CoverInput = { runId: string; templateId: string; prompt: string; privateInputObjectKey?: string };
type CoverJob = {
  id: string; type: 'image_generate'; status: 'queued'; attempts: number;
  autopublishRunId: string; autopublishStage: 'generating_cover'; templateId: string;
  targetPrefix: string; sourceInputObjectKey?: undefined; input: Record<string, unknown>;
};
export type CoverRepository = { create(job: CoverJob): Promise<CoverJob> };

export function privateInputExpiry(createdAt: Date, finishedAt: Date) {
  return new Date(Math.min(finishedAt.getTime() + DAY_MS, createdAt.getTime() + MAX_RETENTION_MS));
}

export async function createAutopublishCoverJob(input: CoverInput, repository: CoverRepository) {
  const targetPrefix = `public/templates/${input.templateId}/`;
  return repository.create({
    id: randomUUID(), type: 'image_generate', status: 'queued', attempts: 0,
    autopublishRunId: input.runId, autopublishStage: 'generating_cover',
    templateId: input.templateId, targetPrefix, sourceInputObjectKey: undefined,
    input: { prompt: input.prompt, jobPurpose: 'autopublish_public_cover', autopublishRunId: input.runId, templateId: input.templateId, targetPrefix },
  });
}

export async function createAutopublishCoverJobInDatabase(input: CoverInput) {
  return createAutopublishCoverJob(input, { async create(job) {
    await db.insert(generationJobs).values({
      id: job.id, type: job.type, status: job.status, attempts: job.attempts,
      autopublishRunId: job.autopublishRunId, autopublishStage: job.autopublishStage,
      templateId: job.templateId, input: job.input,
    });
    return job;
  } });
}

export async function cleanupPrivateAutopublishInput(run: { id: string; createdAt: Date; finishedAt: Date }) {
  await db.update(mediaObjects).set({ expiresAt: privateInputExpiry(run.createdAt, run.finishedAt) }).where(and(
    eq(mediaObjects.ownerType, 'autopublish_run'), eq(mediaObjects.ownerId, run.id),
    eq(mediaObjects.prefixKind, 'private/autopublish'),
  ));
}

export async function markExpiredPrivateAutopublishInputs(now = new Date()) {
  const expired = await db.select({ id: mediaObjects.id }).from(mediaObjects).where(and(
    eq(mediaObjects.prefixKind, 'private/autopublish'), isNull(mediaObjects.deletedAt),
    lte(mediaObjects.expiresAt, now),
  ));
  const objects = await db.select({ id: mediaObjects.id, objectKey: mediaObjects.objectKey }).from(mediaObjects).where(and(
    eq(mediaObjects.prefixKind, 'private/autopublish'), isNull(mediaObjects.deletedAt),
    lte(mediaObjects.expiresAt, now),
  ));
  for (const object of objects) await deleteObject(object.objectKey);
  if (expired.length) await db.update(mediaObjects).set({ deletedAt: now }).where(and(
    eq(mediaObjects.prefixKind, 'private/autopublish'), isNull(mediaObjects.deletedAt),
    lte(mediaObjects.expiresAt, now),
  ));
  return expired.length;
}
