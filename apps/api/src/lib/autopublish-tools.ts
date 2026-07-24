import { autopublishCreateInputSchema } from '@promptix/shared';
import type { AutopublishService } from './autopublish-service.js';

type ToolContext = {
  allowedSourceTypes: string[];
  grant: { id: string };
  service: AutopublishService;
  requestedBy?: string | null;
  agentId?: string | null;
  validateGrant?(input: Record<string, unknown>): Promise<void> | void;
};

export async function startAutopublishRunTool(input: Record<string, unknown>, context: ToolContext) {
  if ('budget' in input) throw new Error('AUTOPUBLISH_BUDGET_OVERRIDE_FORBIDDEN');
  const parsed = autopublishCreateInputSchema.parse(input);
  if (!context.allowedSourceTypes.includes(parsed.sourceType)) {
    throw new Error('AUTOPUBLISH_SOURCE_FORBIDDEN');
  }
  await context.validateGrant?.(parsed);
  return context.service.create({
    ...parsed,
    requestedBy: context.requestedBy ?? null,
    agentId: context.agentId ?? 'scheduled-autopublish-agent',
    capabilityGrantId: context.grant.id,
  });
}

export async function getAutopublishRunTool(
  input: { runId: string },
  context: Pick<ToolContext, 'service'>,
) {
  return context.service.get(input.runId);
}

export async function cancelAutopublishRunTool(
  input: { runId: string; actorId: string },
  context: Pick<ToolContext, 'service'>,
) {
  return context.service.cancel(input.runId, { type: 'admin', id: input.actorId });
}

export async function listAutopublishExceptionsTool(
  _input: Record<string, never>,
  context: Pick<ToolContext, 'service'>,
) {
  return context.service.listExceptions();
}
