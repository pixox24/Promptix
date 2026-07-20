import {
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestSystemPromptSchema,
  type IngestFlowType,
} from '@promptix/shared';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { ingestSystemPrompts } from '../db/schema.js';

export function normalizeIngestSystemPrompt(value: unknown): string {
  const parsed = ingestSystemPromptSchema.safeParse(value);
  if (!parsed.success) throw new Error('System prompt must contain 1-20000 characters');
  return parsed.data;
}

export function effectiveIngestSystemPrompt(
  _flow: IngestFlowType,
  override: unknown,
  configured: string,
): string {
  return override === undefined
    ? normalizeIngestSystemPrompt(configured)
    : normalizeIngestSystemPrompt(override);
}

export async function loadIngestSystemPrompt(flow: IngestFlowType) {
  const [row] = await getDb().select().from(ingestSystemPrompts)
    .where(eq(ingestSystemPrompts.flowType, flow)).limit(1);
  return row?.prompt ?? DEFAULT_INGEST_SYSTEM_PROMPTS[flow];
}

export async function listIngestSystemPrompts() {
  const rows = await getDb().select().from(ingestSystemPrompts);
  const byFlow = new Map(rows.map((row) => [row.flowType, row]));
  return (['text_expand', 'image_reverse'] as const).map((flowType) => ({
    flowType,
    prompt: byFlow.get(flowType)?.prompt ?? DEFAULT_INGEST_SYSTEM_PROMPTS[flowType],
    updatedAt: byFlow.get(flowType)?.updatedAt ?? null,
  }));
}

export async function saveIngestSystemPrompt(
  flowType: IngestFlowType,
  prompt: unknown,
  adminId: string,
) {
  const normalized = normalizeIngestSystemPrompt(prompt);
  const [row] = await getDb().insert(ingestSystemPrompts).values({
    flowType, prompt: normalized, updatedBy: adminId,
  }).onConflictDoUpdate({
    target: ingestSystemPrompts.flowType,
    set: { prompt: normalized, updatedBy: adminId, updatedAt: new Date() },
  }).returning();
  return row;
}
