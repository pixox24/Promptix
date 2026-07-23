import type { AutopublishRules } from '@promptix/shared';

export const AUTOPUBLISH_AGENT_SCOPES = [
  'autopublish.run:create',
  'autopublish.run:read',
  'autopublish.run:cancel',
  'autopublish.exception:list',
] as const;

export type AutopublishAgentScope = typeof AUTOPUBLISH_AGENT_SCOPES[number];
export type AutopublishBudget = AutopublishRules['budgets'];

export type AutopublishSourceConstraints = {
  sourceTypes?: string[];
  sourceItemIds?: string[];
  sourceItemIdPrefixes?: string[];
  flowTypes?: Array<'text_expand' | 'image_reverse'>;
};

export type CapabilityGrant = {
  id: string;
  triggerType: string;
  agentId: string;
  initiatedBy: string | null;
  scopes: string[];
  inputSnapshotHash: string | null;
  sourceConstraints: AutopublishSourceConstraints | Record<string, unknown>;
  budget: Partial<AutopublishBudget> | Record<string, unknown>;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type AutopublishGrantRequest = {
  triggerType: string;
  scope: string;
  inputSnapshotHash: string;
  now: Date;
  requestedBy?: string | null;
  agentId?: string | null;
  sourceType?: string;
  sourceItemId?: string;
  flowType?: 'text_expand' | 'image_reverse';
  budget?: AutopublishBudget;
};

export class AutopublishCapabilityError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AutopublishCapabilityError';
  }
}

const budgetKeys = [
  'maximumModelCalls',
  'maximumCoverAttempts',
  'maximumDurationMinutes',
  'maximumConcurrentPerAgent',
  'maximumRunsPerHour',
  'maximumBatchSize',
] as const satisfies ReadonlyArray<keyof AutopublishBudget>;

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function assertSourceConstraints(
  grant: CapabilityGrant,
  request: AutopublishGrantRequest,
) {
  const constraints = grant.sourceConstraints;
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');
  }

  const sourceTypes = asStringArray(constraints.sourceTypes);
  const sourceItemIds = asStringArray(constraints.sourceItemIds);
  const prefixes = asStringArray(constraints.sourceItemIdPrefixes);
  const flowTypes = asStringArray(constraints.flowTypes);
  const malformed = (
    ('sourceTypes' in constraints && !sourceTypes)
    || ('sourceItemIds' in constraints && !sourceItemIds)
    || ('sourceItemIdPrefixes' in constraints && !prefixes)
    || ('flowTypes' in constraints && !flowTypes)
  );
  if (malformed) throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');

  if (sourceTypes && (!request.sourceType || !sourceTypes.includes(request.sourceType))) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');
  }
  if (sourceItemIds && (!request.sourceItemId || !sourceItemIds.includes(request.sourceItemId))) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');
  }
  if (prefixes && (!request.sourceItemId || !prefixes.some((prefix) => request.sourceItemId!.startsWith(prefix)))) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');
  }
  if (flowTypes && (!request.flowType || !flowTypes.includes(request.flowType))) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_SOURCE_FORBIDDEN');
  }
}

function assertBudget(grant: CapabilityGrant, requested: AutopublishBudget | undefined) {
  if (!requested) return;
  if (!grant.budget || typeof grant.budget !== 'object' || Array.isArray(grant.budget)) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_BUDGET_EXCEEDED');
  }
  for (const key of budgetKeys) {
    const limit = grant.budget[key];
    if (typeof limit !== 'number' || !Number.isFinite(limit) || requested[key] > limit) {
      throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_BUDGET_EXCEEDED');
    }
  }
}

export function assertAutopublishGrant(
  grant: CapabilityGrant,
  request: AutopublishGrantRequest,
) {
  if (grant.revokedAt || grant.expiresAt.getTime() <= request.now.getTime()) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_EXPIRED');
  }
  if (grant.triggerType !== request.triggerType) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_TRIGGER_MISMATCH');
  }
  if (
    !AUTOPUBLISH_AGENT_SCOPES.includes(request.scope as AutopublishAgentScope)
    || !grant.scopes.includes(request.scope)
  ) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_SCOPE_FORBIDDEN');
  }
  if (grant.inputSnapshotHash && grant.inputSnapshotHash !== request.inputSnapshotHash) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_INPUT_MISMATCH');
  }
  if (grant.initiatedBy && grant.initiatedBy !== request.requestedBy) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_INITIATOR_MISMATCH');
  }
  if (request.agentId !== undefined && grant.agentId !== request.agentId) {
    throw new AutopublishCapabilityError('AUTOPUBLISH_GRANT_AGENT_MISMATCH');
  }
  assertSourceConstraints(grant, request);
  assertBudget(grant, request.budget);
}
