import { classifyGovernanceRisk, governanceProposalPatchSchema, type GovernanceField, type GovernanceRuleSet, type TemplateVersionSnapshot } from '@promptix/shared';

export type ExecutorItem = {
  id: string;
  idempotencyKey: string;
  templateId: string;
  baseVersion: number;
  action: 'update_metadata' | 'update_prompt' | 'update_variables' | 'feature' | 'unfeature' | 'reorder_featured' | 'publish' | 'archive' | 'delete';
  patch: Record<string, unknown>;
  confidence: number;
  ruleSetVersion: number;
  before: TemplateVersionSnapshot;
  featured?: { resultingSlotCount: number; replacementRatio: number; hoursSinceLastAdjustment: number };
};

export type ExecutorOutcome = { itemId: string; status: 'applied' | 'awaiting_approval' | 'conflict' | 'failed' | 'rolled_back'; appliedVersion?: number; errorCode?: string };

export type GovernanceExecutorRepository = {
  findOutcome(idempotencyKey: string): Promise<ExecutorOutcome | null>;
  loadTemplate(templateId: string): Promise<{ currentVersion: number } | null>;
  loadActiveRules(): Promise<{ version: number; rules: GovernanceRuleSet }>;
  applyVersion(input: { item: ExecutorItem; expectedVersion: number; patch: Record<string, unknown>; source: 'agent' | 'rollback'; snapshot: TemplateVersionSnapshot }): Promise<number | null>;
  recordOutcome(idempotencyKey: string, outcome: ExecutorOutcome): Promise<void>;
};

export async function executeGovernanceItem(repository: GovernanceExecutorRepository, item: ExecutorItem): Promise<ExecutorOutcome> {
  const replay = await repository.findOutcome(item.idempotencyKey);
  if (replay) return replay;
  try {
    const current = await repository.loadTemplate(item.templateId);
    if (!current || current.currentVersion !== item.baseVersion) {
      const outcome = { itemId: item.id, status: 'conflict', errorCode: 'VERSION_CONFLICT' } as const;
      await repository.recordOutcome(item.idempotencyKey, outcome);
      return outcome;
    }
    const active = await repository.loadActiveRules();
    if (active.version !== item.ruleSetVersion) {
      const outcome = { itemId: item.id, status: 'awaiting_approval', errorCode: 'RULE_SET_CHANGED' } as const;
      await repository.recordOutcome(item.idempotencyKey, outcome);
      return outcome;
    }
    const patch = governanceProposalPatchSchema.parse(item.patch);
    const decision = classifyGovernanceRisk({
      action: item.action,
      changedFields: Object.keys(patch) as GovernanceField[],
      confidence: item.confidence,
      batchSize: 1,
      featured: item.featured,
    }, active.rules);
    if (decision.requiresApproval) {
      const outcome = { itemId: item.id, status: 'awaiting_approval', errorCode: 'APPROVAL_REQUIRED' } as const;
      await repository.recordOutcome(item.idempotencyKey, outcome);
      return outcome;
    }
    const nextSnapshot = { ...item.before, ...patch, version: item.baseVersion + 1 } as TemplateVersionSnapshot;
    const version = await repository.applyVersion({ item, expectedVersion: item.baseVersion, patch, source: 'agent', snapshot: nextSnapshot });
    const outcome: ExecutorOutcome = version
      ? { itemId: item.id, status: 'applied', appliedVersion: version }
      : { itemId: item.id, status: 'conflict', errorCode: 'VERSION_CONFLICT' };
    await repository.recordOutcome(item.idempotencyKey, outcome);
    return outcome;
  } catch {
    const outcome = { itemId: item.id, status: 'failed', errorCode: 'ITEM_EXECUTION_FAILED' } as const;
    await repository.recordOutcome(item.idempotencyKey, outcome);
    return outcome;
  }
}

export async function executeGovernanceChangeSet(repository: GovernanceExecutorRepository, items: ExecutorItem[]) {
  const outcomes: ExecutorOutcome[] = [];
  for (const item of items) outcomes.push(await executeGovernanceItem(repository, item));
  const applied = outcomes.filter((item) => item.status === 'applied').length;
  const failed = outcomes.filter((item) => ['failed', 'conflict'].includes(item.status)).length;
  return { outcomes, status: applied && failed ? 'partially_succeeded' : failed ? 'failed' : outcomes.some((item) => item.status === 'awaiting_approval') ? 'awaiting_approval' : 'succeeded' };
}

export async function retryGovernanceItems(repository: GovernanceExecutorRepository, items: ExecutorItem[], previous: ExecutorOutcome[]) {
  const retryable = new Set(previous.filter((item) => item.status === 'failed').map((item) => item.itemId));
  return executeGovernanceChangeSet(repository, items.filter((item) => retryable.has(item.id)));
}

export async function rollbackGovernanceItem(repository: GovernanceExecutorRepository, input: {
  item: ExecutorItem;
  appliedVersion: number;
  rollbackUntil: Date;
  now?: Date;
}) {
  if (input.item.action === 'delete') return { itemId: input.item.id, status: 'failed', errorCode: 'ROLLBACK_NOT_SUPPORTED' } as const;
  if ((input.now ?? new Date()) > input.rollbackUntil) return { itemId: input.item.id, status: 'failed', errorCode: 'ROLLBACK_EXPIRED' } as const;
  const current = await repository.loadTemplate(input.item.templateId);
  if (!current || current.currentVersion !== input.appliedVersion) return { itemId: input.item.id, status: 'conflict', errorCode: 'VERSION_CONFLICT' } as const;
  const restored = { ...input.item.before, version: input.appliedVersion + 1 };
  const version = await repository.applyVersion({ item: input.item, expectedVersion: input.appliedVersion, patch: input.item.before, source: 'rollback', snapshot: restored });
  return version
    ? { itemId: input.item.id, status: 'rolled_back', appliedVersion: version } as const
    : { itemId: input.item.id, status: 'conflict', errorCode: 'VERSION_CONFLICT' } as const;
}
