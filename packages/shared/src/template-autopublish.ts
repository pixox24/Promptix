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
export const autopublishRulesSchema = z.object({
  delegatedEnabled: z.boolean().default(false),
  scheduledAgentEnabled: z.boolean().default(false),
  mode: z.enum(['shadow', 'live']).default('shadow'),
  frozen: z.boolean().default(false),
  maximumRepairAttempts: z.number().int().min(0).max(2).default(2),
  minimumOverallScore: z.number().min(0).max(100).default(92),
  minimumCriticalDimensionScore: z.number().min(0).max(100).default(85),
  observationHours: z.number().int().min(1).max(24 * 30).default(72),
  budgets: z.object({
    maximumModelCalls: z.number().int().min(1).max(20).default(6),
    maximumCoverAttempts: z.number().int().min(1).max(5).default(2),
    maximumDurationMinutes: z.number().int().min(1).max(60).default(10),
    maximumConcurrentPerAgent: z.number().int().min(1).max(20).default(2),
    maximumRunsPerHour: z.number().int().min(1).max(500).default(20),
    maximumBatchSize: z.number().int().min(1).max(100).default(10),
  }).default({}),
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
});

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
