import { z } from 'zod';

export const autopublishFlowTypeSchema = z.enum(['text_expand', 'image_reverse']);
export const autopublishTriggerSchema = z.enum(['delegated', 'scheduled_agent']);
export const autopublishRecoveryActionSchema = z.enum([
  'edit_draft', 'map_taxonomy', 'review_taxonomy', 'confirm_distinct',
  'retry_cover', 'retry_quality', 'retry_after_conflict',
]);
export const autopublishRunStatusSchema = z.enum([
  'queued', 'running', 'conflict_waiting', 'needs_attention', 'duplicate_found',
  'rejected', 'succeeded', 'failed', 'cancelled',
]);
export const autopublishStageSchema = z.enum([
  'queued', 'generating_draft', 'validating', 'repairing',
  'verifying_taxonomy', 'screening', 'checking_duplicates',
  'creating_template', 'generating_cover', 'reviewing_quality',
  'adversarial_review', 'issuing_permit', 'publishing',
]);
export const autopublishHardGateSchema = z.enum([
  'SCHEMA_INVALID', 'TAXONOMY_INVALID', 'TAXONOMY_UNRESOLVED',
  'SAFETY_REJECTED', 'EXACT_DUPLICATE', 'NEAR_DUPLICATE',
  'COVER_REQUIRED', 'BUDGET_EXCEEDED', 'VERSION_CONFLICT',
  'RULE_CONFLICT', 'PERMIT_INVALID',
]);
export const autopublishErrorCodeSchema = z.enum([
  'AUTOPUBLISH_FROZEN', 'AUTOPUBLISH_GRANT_EXPIRED',
  'AUTOPUBLISH_GRANT_INPUT_MISMATCH', 'AUTOPUBLISH_GRANT_TRIGGER_MISMATCH',
  'AUTOPUBLISH_SCOPE_FORBIDDEN',
  'SCHEMA_INVALID', 'TAXONOMY_INVALID', 'TAXONOMY_UNRESOLVED',
  'TAXONOMY_LOW_CONFIDENCE', 'SAFETY_REJECTED', 'EXACT_DUPLICATE',
  'NEAR_DUPLICATE', 'COVER_REQUIRED', 'QUALITY_THRESHOLD_NOT_MET',
  'BUDGET_EXCEEDED', 'VERSION_CONFLICT', 'RULE_CONFLICT',
  'PERMIT_INVALID', 'ACTIVE_GOVERNANCE_WORK_EXISTS',
]);
export type AutopublishErrorCode = z.infer<typeof autopublishErrorCodeSchema>;
export type AutopublishRecoveryAction = z.infer<typeof autopublishRecoveryActionSchema>;

export const autopublishCriticalDimensionsSchema = z.object({
  semanticFidelity: z.number().min(0).max(100),
  promptCoherence: z.number().min(0).max(100),
  variableReuse: z.number().min(0).max(100),
  taxonomyAccuracy: z.number().min(0).max(100),
  coverAlignment: z.number().min(0).max(100),
});
export const autopublishQualityAssessmentSchema = z.object({
  overallScore: z.number().min(0).max(100),
  criticalDimensions: autopublishCriticalDimensionsSchema,
  hardGateFailures: z.array(autopublishHardGateSchema),
  requiresCounterReview: z.boolean(),
});

export const autopublishBudgetSchema = z.object({
  maximumModelCalls: z.number().int().min(1).max(20).default(6),
  maximumCoverAttempts: z.number().int().min(1).max(5).default(2),
  maximumDurationMinutes: z.number().int().min(1).max(60).default(10),
  maximumConcurrentPerAgent: z.number().int().min(1).max(20).default(2),
  maximumRunsPerHour: z.number().int().min(1).max(500).default(20),
  maximumBatchSize: z.number().int().min(1).max(100).default(10),
}).default({});

export const autopublishBudgetConsumedSchema = z.object({
  modelCalls: z.number().int().min(0).max(20),
  coverAttempts: z.number().int().min(0).max(5),
  durationMinutes: z.number().int().min(0).max(60),
});

export const autopublishRulesSchema = z.object({
  delegatedEnabled: z.boolean().default(false),
  scheduledAgentEnabled: z.boolean().default(false),
  mode: z.enum(['shadow', 'live']).default('shadow'),
  frozen: z.boolean().default(false),
  maximumRepairAttempts: z.number().int().min(0).max(2).default(2),
  minimumOverallScore: z.number().min(92).max(100).default(92),
  minimumCriticalDimensionScore: z.number().min(85).max(100).default(85),
  observationHours: z.number().int().min(72).max(24 * 30).default(72),
  budgets: autopublishBudgetSchema,
}).default({});
export type AutopublishRules = z.infer<typeof autopublishRulesSchema>;
export type AutopublishQualityAssessment = z.infer<typeof autopublishQualityAssessmentSchema>;

export const autopublishCreateInputSchema = z.object({
  flowType: autopublishFlowTypeSchema,
  triggerType: autopublishTriggerSchema,
  text: z.string().trim().min(1).max(50_000).optional(),
  allowAutomaticRepair: z.boolean().default(true),
  sourceType: z.string().trim().min(1).max(80),
  sourceItemId: z.string().trim().min(1).max(200),
  modelId: z.string().uuid().optional(),
  visionModelId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict();

const autopublishRunBaseSchema = z.object({
  id: z.string().uuid(),
  status: autopublishRunStatusSchema,
  currentStage: autopublishStageSchema,
  triggerType: autopublishTriggerSchema,
  requestedBy: z.string().uuid().nullable(),
  agentId: z.string().trim().min(1).max(120).nullable(),
  capabilityGrantId: z.string().uuid(),
  flowType: autopublishFlowTypeSchema,
  sourceType: z.string().trim().min(1).max(80),
  sourceItemId: z.string().trim().min(1).max(200),
  inputSnapshotHash: z.string().trim().min(1).max(200),
  ruleSetId: z.string().uuid(),
  ruleSetVersion: z.number().int().min(1).max(1_000_000),
  taxonomySnapshotHash: z.string().trim().min(1).max(200),
  promptVersion: z.string().trim().min(1).max(120),
  budgetSnapshot: autopublishBudgetSchema,
  budgetConsumed: autopublishBudgetConsumedSchema,
  repairCount: z.number().int().min(0).max(2),
  templateId: z.string().trim().min(1).max(120).nullable(),
  permitId: z.string().uuid().nullable(),
  changeSetId: z.string().uuid().nullable(),
  errorCode: autopublishErrorCodeSchema.nullable(),
  errorDetails: z.record(z.unknown()).nullable(),
  nextAllowedActions: z.array(autopublishRecoveryActionSchema).max(autopublishRecoveryActionSchema.options.length),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  observationUntil: z.string().datetime().nullable(),
  rollbackUntil: z.string().datetime().nullable(),
});
export const autopublishRunSchema = autopublishRunBaseSchema.superRefine((run, ctx) => {
  const budgetLimits = [
    ['modelCalls', 'maximumModelCalls', 'Model calls cannot exceed budgetSnapshot.maximumModelCalls'],
    ['coverAttempts', 'maximumCoverAttempts', 'Cover attempts cannot exceed budgetSnapshot.maximumCoverAttempts'],
    ['durationMinutes', 'maximumDurationMinutes', 'Duration cannot exceed budgetSnapshot.maximumDurationMinutes'],
  ] as const;
  for (const [consumedKey, budgetKey, message] of budgetLimits) {
    if (run.budgetConsumed[consumedKey] > run.budgetSnapshot[budgetKey]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['budgetConsumed', consumedKey], message });
    }
  }

  if (run.status === 'succeeded') {
    const requiredFields = [
      ['finishedAt', 'Succeeded runs require finishedAt'],
      ['templateId', 'Succeeded runs require templateId'],
      ['permitId', 'Succeeded runs require permitId'],
      ['changeSetId', 'Succeeded runs require changeSetId'],
      ['observationUntil', 'Succeeded runs require observationUntil'],
      ['rollbackUntil', 'Succeeded runs require rollbackUntil'],
    ] as const;
    for (const [field, message] of requiredFields) {
      if (run[field] === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
    if (run.finishedAt !== null) {
      const minimumDeadline = Date.parse(run.finishedAt) + (72 * 60 * 60 * 1000);
      for (const [field, value] of [
        ['observationUntil', run.observationUntil],
        ['rollbackUntil', run.rollbackUntil],
      ] as const) {
        if (value !== null && Date.parse(value) < minimumDeadline) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} must be at least 72 hours after finishedAt`,
          });
        }
      }
    }
  } else {
    for (const [field, value] of [
      ['observationUntil', run.observationUntil],
      ['rollbackUntil', run.rollbackUntil],
    ] as const) {
      if (value !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is only set after a succeeded run` });
      }
    }
  }

  if (run.status === 'duplicate_found') {
    if (run.templateId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templateId'], message: 'duplicate_found runs require an existing templateId' });
    }
    for (const [field, value] of [
      ['permitId', run.permitId],
      ['changeSetId', run.changeSetId],
      ['observationUntil', run.observationUntil],
      ['rollbackUntil', run.rollbackUntil],
    ] as const) {
      if (value !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `duplicate_found runs must not set ${field}` });
      }
    }
  }
});
export type AutopublishRun = z.infer<typeof autopublishRunSchema>;

export const autopublishTaxonomyVerificationSchema = z.object({
  runId: z.string().uuid(),
  agentId: z.string().trim().min(1).max(120).nullable(),
  modelId: z.string().uuid(),
  promptVersion: z.string().trim().min(1).max(120),
  taxonomySnapshotHash: z.string().trim().min(1).max(200),
  evidenceArtifactId: z.string().uuid(),
  verifiedAt: z.string().datetime(),
});
export type AutopublishTaxonomyVerification = z.infer<typeof autopublishTaxonomyVerificationSchema>;

export function decideAutopublishPolicy(input: {
  assessment: AutopublishQualityAssessment;
  budgetExceeded: boolean;
  rules: AutopublishRules;
}): { kind: 'issue_permit' | 'counter_review' | 'duplicate_found' | 'needs_attention' | 'rejected'; reasonCode?: string } {
  const { assessment, rules } = input;
  if (assessment.hardGateFailures.includes('SAFETY_REJECTED')) return { kind: 'rejected', reasonCode: 'SAFETY_REJECTED' };
  if (assessment.hardGateFailures.includes('EXACT_DUPLICATE')) return { kind: 'duplicate_found', reasonCode: 'EXACT_DUPLICATE' };
  if (input.budgetExceeded) return { kind: 'needs_attention', reasonCode: 'BUDGET_EXCEEDED' };
  if (assessment.hardGateFailures.length) return { kind: 'needs_attention', reasonCode: assessment.hardGateFailures[0] };
  if (
    assessment.overallScore < rules.minimumOverallScore
    || Object.values(assessment.criticalDimensions).some((score) => score < rules.minimumCriticalDimensionScore)
  ) {
    return { kind: 'needs_attention', reasonCode: 'QUALITY_THRESHOLD_NOT_MET' };
  }
  return assessment.requiresCounterReview ? { kind: 'counter_review' } : { kind: 'issue_permit' };
}
