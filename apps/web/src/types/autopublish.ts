import type {
  AutopublishRecoveryAction,
  AutopublishRun,
  TemplateDraft,
} from '@promptix/shared';

export type AutopublishRunView = AutopublishRun & {
  retryable: boolean;
  completedStages: string[];
  stageAttempts: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
};

export type AutopublishCreateResponse = {
  runId: string;
  status: AutopublishRun['status'];
  currentStage: AutopublishRun['currentStage'];
  statusUrl: string;
};

export type CreateTextRunInput = {
  flowType: 'text_expand';
  triggerType?: 'delegated';
  text: string;
  modelId?: string;
  idempotencyKey: string;
  allowAutomaticRepair?: boolean;
};

export type CreateImageRunInput = {
  file: File;
  modelId?: string;
  visionModelId?: string;
  idempotencyKey: string;
  allowAutomaticRepair?: boolean;
};

export type TaxonomyCorrection = Record<string, unknown>;

export function shouldPollAutopublishRun(status: AutopublishRun['status']) {
  return status === 'queued' || status === 'running';
}

export function allowedAutopublishActions(
  run: Pick<AutopublishRunView, 'nextAllowedActions'>,
): AutopublishRecoveryAction[] {
  return [...run.nextAllowedActions];
}

export type AutopublishActionInput = {
  idempotencyKey: string;
  draft?: TemplateDraft;
  taxonomy?: TaxonomyCorrection;
};
