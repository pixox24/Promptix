import { createHmac, timingSafeEqual } from 'node:crypto';

export type AutopublishPermitInput = {
  runId: string;
  templateId: string;
  templateVersion: number;
  ruleSetId: string;
  ruleSetVersion: number;
  contentHash: string;
  expiresAt: Date;
};
export type StoredAutopublishPermit = AutopublishPermitInput & {
  id: string;
  action: 'publish';
  permitHash: string;
  consumedAt: Date | null;
  revokedAt: Date | null;
};
export type AutopublishPermitRepository = {
  create(input: Omit<StoredAutopublishPermit, 'id' | 'consumedAt' | 'revokedAt'>): Promise<StoredAutopublishPermit>;
  load(id: string): Promise<StoredAutopublishPermit | null>;
  consume(id: string, at: Date): Promise<StoredAutopublishPermit>;
};

function payload(input: AutopublishPermitInput) {
  return {
    runId: input.runId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    ruleSetId: input.ruleSetId,
    ruleSetVersion: input.ruleSetVersion,
    action: 'publish' as const,
    contentHash: input.contentHash,
    expiresAt: input.expiresAt.toISOString(),
  };
}

export function autopublishPermitHash(input: AutopublishPermitInput, secret: string) {
  if (secret.length < 8) throw new Error('AUTOPUBLISH_PERMIT_SECRET_INVALID');
  return createHmac('sha256', secret).update(JSON.stringify(payload(input))).digest('hex');
}

export async function issueAutopublishPermit(
  input: AutopublishPermitInput,
  repository: AutopublishPermitRepository,
  secret = process.env.AUTOPUBLISH_PERMIT_SECRET ?? '',
) {
  return repository.create({
    ...input,
    action: 'publish',
    permitHash: autopublishPermitHash(input, secret),
  });
}

export async function verifyAndConsumeAutopublishPermit(
  input: AutopublishPermitInput & { permitId: string; now: Date },
  repository: AutopublishPermitRepository,
  secret = process.env.AUTOPUBLISH_PERMIT_SECRET ?? '',
) {
  const permit = await repository.load(input.permitId);
  if (!permit) throw new Error('PERMIT_NOT_FOUND');
  if (permit.revokedAt) throw new Error('PERMIT_REVOKED');
  if (permit.consumedAt) throw new Error('PERMIT_ALREADY_CONSUMED');
  if (permit.expiresAt <= input.now) throw new Error('PERMIT_EXPIRED');
  if (permit.runId !== input.runId || permit.templateId !== input.templateId) throw new Error('PERMIT_TARGET_CHANGED');
  if (permit.templateVersion !== input.templateVersion) throw new Error('PERMIT_VERSION_CHANGED');
  if (permit.ruleSetId !== input.ruleSetId || permit.ruleSetVersion !== input.ruleSetVersion) throw new Error('PERMIT_RULES_CHANGED');
  if (permit.contentHash !== input.contentHash) throw new Error('PERMIT_CONTENT_CHANGED');
  const expected = autopublishPermitHash(input, secret);
  const actualBuffer = Buffer.from(permit.permitHash);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('PERMIT_HASH_INVALID');
  }
  return repository.consume(permit.id, input.now);
}
