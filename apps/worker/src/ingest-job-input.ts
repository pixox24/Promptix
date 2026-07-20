import {
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestFlowTypeSchema,
  ingestSystemPromptSchema,
} from '@promptix/shared';

export function effectiveIngestJobInput(
  jobType: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const flow = ingestFlowTypeSchema.safeParse(jobType);
  if (!flow.success) return input;
  const parsed = ingestSystemPromptSchema.safeParse(input.systemPrompt);
  return {
    ...input,
    systemPrompt: parsed.success ? parsed.data : DEFAULT_INGEST_SYSTEM_PROMPTS[flow.data],
  };
}
