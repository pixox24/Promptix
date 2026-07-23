import {
  autopublishBudgetSchema,
  autopublishCreateInputSchema,
  autopublishRecoveryActionSchema,
  autopublishRulesSchema,
  type AutopublishRecoveryAction,
  type AutopublishRules,
  type AutopublishRun,
} from '@promptix/shared';
import {
  assertAutopublishGrant,
  type AutopublishBudget,
  type CapabilityGrant,
} from './autopublish-capabilities.js';

export type CreateAutopublishRunInput = {
  flowType: 'text_expand' | 'image_reverse';
  triggerType: 'delegated' | 'scheduled_agent';
  text?: string;
  allowAutomaticRepair?: boolean;
  sourceType: string;
  sourceItemId: string;
  modelId?: string;
  visionModelId?: string;
  idempotencyKey: string;
  requestedBy: string | null;
  agentId: string | null;
  capabilityGrantId: string;
};

export type AutopublishInputSnapshot = {
  flowType: CreateAutopublishRunInput['flowType'];
  triggerType: CreateAutopublishRunInput['triggerType'];
  text?: string;
  allowAutomaticRepair: boolean;
  sourceType: string;
  sourceItemId: string;
  modelId?: string;
  visionModelId?: string;
  requestedBy: string | null;
  agentId: string | null;
  capabilityGrantId: string;
};

export type StoredAutopublishRun = AutopublishRun & {
  inputSnapshot: AutopublishInputSnapshot;
  idempotencyKey: string;
};

export type AutopublishStageAttemptView = {
  id?: string;
  runId: string;
  stage: string;
  attempt: number;
  status: string;
  inputHash: string;
  artifactId?: string | null;
  errorCode?: string | null;
};

export type AutopublishArtifactView = {
  id: string;
  runId: string;
  kind: string;
  schemaVersion?: number;
  contentHash: string;
  modelId?: string | null;
  promptVersion?: string | null;
  createdAt?: string;
};

export type AutopublishRunView = StoredAutopublishRun & {
  retryable: boolean;
  completedStages: string[];
  stageAttempts: AutopublishStageAttemptView[];
  artifacts: AutopublishArtifactView[];
};

export type AutopublishAdminActor = { type: 'admin'; id: string };
export type AutopublishAgentActor = { type: 'agent'; id: string; capabilityGrantId: string };
export type AutopublishActor = AutopublishAdminActor | AutopublishAgentActor;

export type AutopublishCreateRecord = {
  actor: AutopublishAgentActor;
  triggerType: CreateAutopublishRunInput['triggerType'];
  requestedBy: string | null;
  agentId: string | null;
  capabilityGrantId: string;
  flowType: CreateAutopublishRunInput['flowType'];
  sourceType: string;
  sourceItemId: string;
  inputSnapshot: AutopublishInputSnapshot;
  inputSnapshotHash: string;
  ruleSetId: string;
  ruleSetVersion: number;
  taxonomySnapshotHash: string;
  promptVersion: string;
  budgetSnapshot: AutopublishBudget;
  idempotencyKey: string;
};

export type AutopublishServiceRepository = {
  findByIdempotencyKey(idempotencyKey: string): Promise<StoredAutopublishRun | null>;
  getGrant(id: string): Promise<CapabilityGrant | null>;
  createRun(input: AutopublishCreateRecord): Promise<StoredAutopublishRun>;
  getRunView(id: string): Promise<AutopublishRunView | null>;
  cancelRun(id: string, actor: AutopublishAdminActor, now: Date): Promise<AutopublishRunView>;
  actRun(
    id: string,
    action: AutopublishRecoveryAction,
    actor: AutopublishAdminActor,
    idempotencyKey: string,
    now: Date,
  ): Promise<AutopublishRunView>;
  listExceptionViews(): Promise<AutopublishRunView[]>;
};

export type AutopublishServiceDependencies = {
  hash(value: unknown): string;
  now(): Date;
  loadRules(): Promise<{ id: string; version: number; rules: AutopublishRules }>;
  loadTaxonomy(): Promise<{ hash: string }>;
  loadPromptVersion(flowType: CreateAutopublishRunInput['flowType']): Promise<string>;
};

export type AutopublishService = {
  create(input: CreateAutopublishRunInput): Promise<AutopublishRun>;
  get(id: string): Promise<AutopublishRunView | null>;
  cancel(id: string, actor: AutopublishActor): Promise<AutopublishRunView>;
  act(
    id: string,
    action: AutopublishRecoveryAction,
    actor: AutopublishActor,
    idempotencyKey: string,
  ): Promise<AutopublishRunView>;
  listExceptions(): Promise<AutopublishRunView[]>;
};

export class AutopublishServiceError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = 'AutopublishServiceError';
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

function minimumBudget(ruleBudget: AutopublishBudget, grantBudget: AutopublishBudget): AutopublishBudget {
  return Object.fromEntries(
    budgetKeys.map((key) => [key, Math.min(ruleBudget[key], grantBudget[key])]),
  ) as AutopublishBudget;
}

function normalizeInput(input: CreateAutopublishRunInput): {
  inputSnapshot: AutopublishInputSnapshot;
  idempotencyKey: string;
} {
  const result = autopublishCreateInputSchema.safeParse({
    flowType: input.flowType,
    triggerType: input.triggerType,
    ...(input.text === undefined ? {} : { text: input.text }),
    allowAutomaticRepair: input.allowAutomaticRepair,
    sourceType: input.sourceType,
    sourceItemId: input.sourceItemId,
    ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
    ...(input.visionModelId === undefined ? {} : { visionModelId: input.visionModelId }),
    idempotencyKey: input.idempotencyKey,
  });
  if (!result.success) throw new AutopublishServiceError('AUTOPUBLISH_INPUT_INVALID');
  const parsed = result.data;
  return {
    idempotencyKey: parsed.idempotencyKey,
    inputSnapshot: {
      flowType: parsed.flowType,
      triggerType: parsed.triggerType,
      ...(parsed.text === undefined ? {} : { text: parsed.text }),
      allowAutomaticRepair: parsed.allowAutomaticRepair,
      sourceType: parsed.sourceType,
      sourceItemId: parsed.sourceItemId,
      ...(parsed.modelId === undefined ? {} : { modelId: parsed.modelId }),
      ...(parsed.visionModelId === undefined ? {} : { visionModelId: parsed.visionModelId }),
      requestedBy: input.requestedBy,
      agentId: input.agentId,
      capabilityGrantId: input.capabilityGrantId,
    },
  };
}

function assertTriggerEnabled(rules: AutopublishRules, triggerType: CreateAutopublishRunInput['triggerType']) {
  if (rules.frozen) throw new AutopublishServiceError('AUTOPUBLISH_FROZEN');
  if (triggerType === 'delegated' && !rules.delegatedEnabled) {
    throw new AutopublishServiceError('AUTOPUBLISH_DELEGATED_DISABLED');
  }
  if (triggerType === 'scheduled_agent' && !rules.scheduledAgentEnabled) {
    throw new AutopublishServiceError('AUTOPUBLISH_SCHEDULED_AGENT_DISABLED');
  }
}

export function createAutopublishService(
  repository: AutopublishServiceRepository,
  dependencies: AutopublishServiceDependencies,
): AutopublishService {
  return {
    async create(input) {
      const normalized = normalizeInput(input);
      const { inputSnapshot, idempotencyKey } = normalized;
      const inputSnapshotHash = dependencies.hash(inputSnapshot);

      const replay = await repository.findByIdempotencyKey(idempotencyKey);
      if (replay) {
        if (replay.inputSnapshotHash !== inputSnapshotHash) {
          throw new AutopublishServiceError('AUTOPUBLISH_IDEMPOTENCY_MISMATCH');
        }
        return replay;
      }

      try {
        const grant = await repository.getGrant(input.capabilityGrantId);
        if (!grant) throw new AutopublishServiceError('AUTOPUBLISH_GRANT_NOT_FOUND');

        const active = await dependencies.loadRules();
        const parsedRules = autopublishRulesSchema.safeParse(active.rules);
        if (!parsedRules.success) throw new AutopublishServiceError('AUTOPUBLISH_RULES_INVALID');
        const rules = parsedRules.data;
        assertTriggerEnabled(rules, inputSnapshot.triggerType);
        const parsedGrantBudget = autopublishBudgetSchema.safeParse(grant.budget);
        if (!parsedGrantBudget.success) {
          throw new AutopublishServiceError('AUTOPUBLISH_GRANT_BUDGET_INVALID');
        }
        const budgetSnapshot = minimumBudget(rules.budgets, parsedGrantBudget.data);

        assertAutopublishGrant(grant, {
          triggerType: inputSnapshot.triggerType,
          scope: 'autopublish.run:create',
          inputSnapshotHash,
          now: dependencies.now(),
          requestedBy: input.requestedBy,
          agentId: input.agentId,
          sourceType: inputSnapshot.sourceType,
          sourceItemId: inputSnapshot.sourceItemId,
          flowType: inputSnapshot.flowType,
          budget: budgetSnapshot,
        });

        const [taxonomy, promptVersion] = await Promise.all([
          dependencies.loadTaxonomy(),
          dependencies.loadPromptVersion(inputSnapshot.flowType),
        ]);
        return await repository.createRun({
          actor: {
            type: 'agent',
            id: grant.agentId,
            capabilityGrantId: grant.id,
          },
          triggerType: inputSnapshot.triggerType,
          requestedBy: input.requestedBy,
          agentId: input.agentId,
          capabilityGrantId: input.capabilityGrantId,
          flowType: inputSnapshot.flowType,
          sourceType: inputSnapshot.sourceType,
          sourceItemId: inputSnapshot.sourceItemId,
          inputSnapshot,
          inputSnapshotHash,
          ruleSetId: active.id,
          ruleSetVersion: active.version,
          taxonomySnapshotHash: taxonomy.hash,
          promptVersion,
          budgetSnapshot,
          idempotencyKey,
        });
      } catch (error) {
        const winner = await repository.findByIdempotencyKey(idempotencyKey);
        if (winner) {
          if (winner.inputSnapshotHash !== inputSnapshotHash) {
            throw new AutopublishServiceError('AUTOPUBLISH_IDEMPOTENCY_MISMATCH');
          }
          return winner;
        }
        throw error;
      }
    },

    get(id) {
      return repository.getRunView(id);
    },

    cancel(id, actor) {
      if (actor.type !== 'admin') {
        throw new AutopublishServiceError('AUTOPUBLISH_CANCEL_ADMIN_REQUIRED');
      }
      return repository.cancelRun(id, actor, dependencies.now());
    },

    act(id, action, actor, idempotencyKey) {
      if (actor.type !== 'admin') {
        throw new AutopublishServiceError('AUTOPUBLISH_ACTION_ADMIN_REQUIRED');
      }
      const parsed = autopublishRecoveryActionSchema.safeParse(action);
      if (!parsed.success) throw new AutopublishServiceError('AUTOPUBLISH_ACTION_FORBIDDEN');
      if (!idempotencyKey.trim()) throw new AutopublishServiceError('AUTOPUBLISH_ACTION_IDEMPOTENCY_REQUIRED');
      return repository.actRun(id, parsed.data, actor, idempotencyKey, dependencies.now());
    },

    listExceptions() {
      return repository.listExceptionViews();
    },
  };
}
