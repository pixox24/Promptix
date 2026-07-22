import { z } from 'zod';

const uniqueStrings = (maximum: number, minimum = 0) => z.array(z.string().trim().min(1).max(120)).min(minimum).max(maximum)
  .refine((values) => new Set(values).size === values.length, 'Values must be unique');

export const governanceQueueIdSchema = z.enum([
  'taxonomy_confirmation',
  'duplicate_candidates',
  'quality_issues',
  'featured_candidates',
  'pending_approval',
  'failed_items',
]);
export type GovernanceQueueId = z.infer<typeof governanceQueueIdSchema>;

export const governanceTriggerSchema = z.enum(['scheduled', 'manual']);
export type GovernanceTrigger = z.infer<typeof governanceTriggerSchema>;

export const governanceRunStatusSchema = z.enum([
  'queued',
  'analyzing',
  'planned',
  'auto_executing',
  'awaiting_approval',
  'partially_succeeded',
  'succeeded',
  'failed',
  'cancelled',
]);
export type GovernanceRunStatus = z.infer<typeof governanceRunStatusSchema>;

export const governanceChangeSetStatusSchema = z.enum([
  'planned',
  'auto_executing',
  'awaiting_approval',
  'approved',
  'rejected',
  'partially_succeeded',
  'succeeded',
  'failed',
  'cancelled',
  'rollback_available',
  'rolled_back',
]);
export type GovernanceChangeSetStatus = z.infer<typeof governanceChangeSetStatusSchema>;

export const governanceExecutionModeSchema = z.enum(['automatic', 'approval']);
export type GovernanceExecutionMode = z.infer<typeof governanceExecutionModeSchema>;

export const governanceProposalStatusSchema = z.enum([
  'planned',
  'accepted',
  'skipped',
  'awaiting_approval',
  'approved',
  'rejected',
  'applied',
  'conflict',
  'failed',
  'rejected',
  'rolled_back',
]);
export type GovernanceProposalStatus = z.infer<typeof governanceProposalStatusSchema>;

export const governanceItemStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'queued',
  'running',
  'applied',
  'skipped',
  'conflict',
  'failed',
  'rolled_back',
]);
export type GovernanceItemStatus = z.infer<typeof governanceItemStatusSchema>;

export const governanceRiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type GovernanceRiskLevel = z.infer<typeof governanceRiskLevelSchema>;

export const governanceActionSchema = z.enum([
  'update_metadata',
  'update_prompt',
  'update_variables',
  'feature',
  'unfeature',
  'reorder_featured',
  'publish',
  'archive',
  'delete',
]);
export type GovernanceAction = z.infer<typeof governanceActionSchema>;

export const governanceFieldSchema = z.enum([
  'name',
  'summary',
  'semantic',
  'tags',
  'promptTemplate',
  'variables',
  'isFeatured',
  'featuredOrder',
]);
export type GovernanceField = z.infer<typeof governanceFieldSchema>;

export const governanceReasonCodeSchema = z.enum([
  'TITLE_UNCLEAR',
  'SUMMARY_UNCLEAR',
  'TAXONOMY_MISSING',
  'TAXONOMY_LOW_CONFIDENCE',
  'TAXONOMY_UNMAPPED',
  'DUPLICATE_CANDIDATE',
  'QUALITY_ISSUE',
  'FEATURED_CANDIDATE',
  'FEATURED_POLICY_EXCEEDED',
  'PROMPT_BEHAVIOR_CHANGE',
  'LIFECYCLE_REQUEST',
  'RULE_CONFLICT',
  'VERSION_CONFLICT',
  'VALIDATION_FAILED',
]);
export type GovernanceReasonCode = z.infer<typeof governanceReasonCodeSchema>;

export const governanceSemanticSchema = z.object({
  workflowType: z.enum(['generate', 'edit']),
  outputType: z.string().trim().min(1).max(80).nullable(),
  scenarios: uniqueStrings(12).default([]),
  styles: uniqueStrings(12).default([]),
  subjects: uniqueStrings(12).default([]),
  tags: uniqueStrings(30).default([]),
  unmappedTerms: z.array(z.object({
    dimension: z.enum(['output_type', 'scenario', 'style', 'subject']),
    label: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(1).max(300),
  })).max(30).default([]),
  confidence: z.object({
    outputType: z.number().min(0).max(1).optional(),
    scenarios: z.number().min(0).max(1).optional(),
    styles: z.number().min(0).max(1).optional(),
    subjects: z.number().min(0).max(1).optional(),
  }).default({}),
});
export type GovernanceSemantic = z.infer<typeof governanceSemanticSchema>;

export const governanceRuleSetSchema = z.object({
  agent: z.object({
    modelId: z.string().uuid().nullable().default(null),
    promptVersion: z.string().trim().min(1).max(120).default('template-governance-v1'),
    systemPrompt: z.string().max(20_000).default(''),
  }).default({}),
  schedule: z.object({
    enabled: z.boolean(),
    cron: z.string().trim().min(1).max(120),
    timezone: z.string().trim().min(1).max(80),
    scanLimit: z.number().int().min(1).max(500),
  }),
  automaticFields: z.array(z.enum(['name', 'summary', 'semantic', 'tags']))
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Automatic fields must be unique'),
  alwaysApprove: z.array(z.enum(['promptTemplate', 'variables', 'publish', 'archive', 'delete']))
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Approval fields must be unique'),
  minimumAutoConfidence: z.number().min(0).max(1),
  maximumAutoBatchSize: z.number().int().min(1).max(1_000),
  rollbackHours: z.number().int().min(1).max(24 * 90),
  featured: z.object({
    slotLimit: z.number().int().min(1).max(1_000),
    maximumReplacementRatio: z.number().min(0).max(1),
    minimumAdjustmentHours: z.number().min(0).max(24 * 365),
    outputTypeQuotas: z.record(z.number().int().min(0).max(1_000)).optional(),
  }),
});
export type GovernanceRuleSet = z.infer<typeof governanceRuleSetSchema>;

export const DEFAULT_GOVERNANCE_RULES: GovernanceRuleSet = governanceRuleSetSchema.parse({
  schedule: {
    enabled: true,
    cron: '0 3 * * *',
    timezone: 'Asia/Shanghai',
    scanLimit: 50,
  },
  automaticFields: ['name', 'summary', 'semantic', 'tags'],
  alwaysApprove: ['promptTemplate', 'variables', 'publish', 'archive', 'delete'],
  minimumAutoConfidence: 0.85,
  maximumAutoBatchSize: 50,
  rollbackHours: 168,
  featured: {
    slotLimit: 12,
    maximumReplacementRatio: 0.2,
    minimumAdjustmentHours: 24,
  },
});

export const governanceTemplateQuerySchema = z.object({
  queue: governanceQueueIdSchema.optional(),
  q: z.string().trim().max(200).optional(),
  source: z.enum(['manual', 'image_reverse', 'text_expand']).optional(),
  lifecycle: z.enum(['draft', 'published', 'archived']).optional(),
  outputType: z.string().trim().min(1).max(80).optional(),
  scenarios: uniqueStrings(20).default([]),
  styles: uniqueStrings(20).default([]),
  subjects: uniqueStrings(20).default([]),
  quality: z.enum(['good', 'attention', 'critical']).optional(),
  agentStatus: governanceProposalStatusSchema.optional(),
  updatedAfter: z.string().datetime().optional(),
  updatedBefore: z.string().datetime().optional(),
  sort: z.enum(['updated_desc', 'updated_asc', 'quality_asc', 'confidence_desc']).default('updated_desc'),
});
export type GovernanceTemplateQuery = z.infer<typeof governanceTemplateQuerySchema>;

export const governanceSelectionScopeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('explicit'),
    templateIds: uniqueStrings(1_000, 1),
    proposalIds: z.array(z.string().uuid()).max(1_000).default([]),
  }),
  z.object({
    mode: z.literal('query'),
    query: governanceTemplateQuerySchema,
    exclusions: uniqueStrings(1_000).default([]),
    snapshotAt: z.string().datetime(),
  }),
]);
export type GovernanceSelectionScope = z.infer<typeof governanceSelectionScopeSchema>;

const governanceVariableSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'select', 'number', 'ratio', 'image']),
  required: z.boolean().default(false),
}).passthrough();

export const templateVersionSnapshotSchema = z.object({
  snapshotSchemaVersion: z.number().int().min(1).default(1),
  templateId: z.string().trim().min(1).max(120),
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(300),
  summary: z.string().max(2_000),
  description: z.string().max(20_000),
  category: z.string().trim().min(1).max(80).optional(),
  semantic: governanceSemanticSchema,
  variables: z.array(governanceVariableSnapshotSchema).max(12),
  promptTemplate: z.string().min(1).max(50_000),
  negativePrompt: z.string().max(20_000).nullable().default(null),
  coverObjectKey: z.string().max(1_000).nullable().default(null),
  coverUrl: z.string().max(4_000).nullable().default(null),
  status: z.enum(['draft', 'published', 'archived']),
  publishedAt: z.string().datetime().nullable().default(null),
  source: z.enum(['manual', 'image_reverse', 'text_expand']),
  sourceMeta: z.record(z.unknown()).nullable().default(null),
  modelHints: z.record(z.unknown()).nullable().default(null),
  i18n: z.record(z.unknown()).nullable().default(null),
  isFeatured: z.boolean(),
  featuredOrder: z.number().int().min(0).max(1_000_000),
  isHot: z.boolean().default(false),
  locale: z.string().trim().min(1).max(20),
  taxonomyAssignments: z.array(z.object({
    termId: z.string().uuid(),
    slug: z.string().trim().min(1).max(80),
    dimension: z.enum(['output_type', 'scenario', 'style', 'subject']),
    source: z.enum(['ai', 'admin', 'migration']).default('migration'),
    confidence: z.number().min(0).max(1).nullable().default(null),
  })).max(100).default([]),
  taxonomyReviewedAt: z.string().datetime().nullable().default(null),
  taxonomyReviewedBy: z.string().uuid().nullable().default(null),
  taxonomyReviewStatus: z.enum(['pending', 'needs_attention', 'reviewed']).default('pending'),
});
export type TemplateVersionSnapshot = z.infer<typeof templateVersionSnapshotSchema>;

export const governanceProposalPatchSchema = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  summary: z.string().max(2_000).optional(),
  semantic: governanceSemanticSchema.optional(),
  tags: uniqueStrings(30).optional(),
  promptTemplate: z.string().min(1).max(50_000).optional(),
  variables: z.array(governanceVariableSnapshotSchema).min(1).max(12).optional(),
  isFeatured: z.boolean().optional(),
  featuredOrder: z.number().int().min(0).max(1_000_000).optional(),
}).strict();
export type GovernanceProposalPatch = z.infer<typeof governanceProposalPatchSchema>;

export const governanceProposalOutputSchema = z.object({
  templateId: z.string().trim().min(1).max(120),
  action: governanceActionSchema.default('update_metadata'),
  proposedPatch: governanceProposalPatchSchema.default({}),
  reasonCodes: z.array(governanceReasonCodeSchema).min(1).max(12),
  explanation: z.string().trim().min(1).max(1_000),
  confidence: z.number().min(0).max(1),
});
export type GovernanceProposalOutput = z.infer<typeof governanceProposalOutputSchema>;

export const governanceProposalSchema = governanceProposalOutputSchema.extend({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  baseVersion: z.number().int().min(1),
  current: templateVersionSnapshotSchema,
  riskLevel: governanceRiskLevelSchema,
  requiresApproval: z.boolean(),
  status: governanceProposalStatusSchema,
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  }).default({ valid: true, issues: [] }),
});
export type GovernanceProposal = z.infer<typeof governanceProposalSchema>;

export const governanceQueueSummarySchema = z.object({
  id: governanceQueueIdSchema,
  count: z.number().int().nonnegative(),
});
export type GovernanceQueueSummary = z.infer<typeof governanceQueueSummarySchema>;

export const governanceChangeSetSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  automatic: z.number().int().nonnegative().default(0),
  awaitingApproval: z.number().int().nonnegative().default(0),
  approved: z.number().int().nonnegative().default(0),
  applied: z.number().int().nonnegative().default(0),
  rejected: z.number().int().nonnegative().default(0),
  conflicts: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  rolledBack: z.number().int().nonnegative().default(0),
  deleted: z.number().int().nonnegative().default(0),
});
export type GovernanceChangeSetSummary = z.infer<typeof governanceChangeSetSummarySchema>;

export const governanceRunStatsSchema = governanceChangeSetSummarySchema.extend({
  changeSets: z.number().int().nonnegative().default(0),
});
export type GovernanceRunStats = z.infer<typeof governanceRunStatsSchema>;

export function deriveGovernanceRunState(input: {
  changeSets: Array<{ id: string; executionMode: string; status: string }>;
  items: Array<{ changeSetId: string; status: string; errorCode?: string | null }>;
}): { status: GovernanceRunStatus; stats: GovernanceRunStats; terminal: boolean } {
  const automaticSetIds = new Set(input.changeSets.filter((set) => set.executionMode === 'automatic').map((set) => set.id));
  const count = (status: string) => input.items.filter((item) => item.status === status).length;
  const stats = governanceRunStatsSchema.parse({
    total: input.items.length,
    automatic: input.items.filter((item) => automaticSetIds.has(item.changeSetId)).length,
    awaitingApproval: count('awaiting_approval'),
    approved: input.changeSets.filter((set) => set.executionMode === 'approval' && set.status === 'approved').length,
    applied: count('applied'),
    rejected: count('rejected'),
    conflicts: count('conflict'),
    skipped: count('skipped'),
    failed: count('failed'),
    rolledBack: count('rolled_back'),
    deleted: input.items.filter((item) => item.status === 'applied' && item.errorCode === 'DELETED').length,
    changeSets: input.changeSets.length,
  });
  const hasRunning = input.items.some((item) => item.status === 'running') || input.changeSets.some((set) => set.status === 'auto_executing');
  const hasPendingExecution = input.items.some((item) => ['pending', 'queued'].includes(item.status));
  let status: GovernanceRunStatus;
  if (hasRunning) status = 'auto_executing';
  else if (hasPendingExecution) status = 'planned';
  else if (stats.awaitingApproval > 0) status = 'awaiting_approval';
  else if (stats.failed > 0 || stats.conflicts > 0) status = stats.applied > 0 || stats.rolledBack > 0 ? 'partially_succeeded' : 'failed';
  else if (stats.rejected > 0) status = stats.applied > 0 || stats.rolledBack > 0 ? 'partially_succeeded' : 'cancelled';
  else status = 'succeeded';
  return { status, stats, terminal: ['partially_succeeded', 'succeeded', 'failed', 'cancelled'].includes(status) };
}

export const governanceRiskInputSchema = z.object({
  action: governanceActionSchema,
  changedFields: z.array(governanceFieldSchema).max(governanceFieldSchema.options.length),
  confidence: z.number().min(0).max(1),
  batchSize: z.number().int().min(1),
  featured: z.object({
    resultingSlotCount: z.number().int().nonnegative(),
    replacementRatio: z.number().min(0).max(1),
    hoursSinceLastAdjustment: z.number().nonnegative(),
  }).optional(),
});
export type GovernanceRiskInput = z.infer<typeof governanceRiskInputSchema>;

export type GovernanceRiskDecision = {
  riskLevel: GovernanceRiskLevel;
  requiresApproval: boolean;
  automatic: boolean;
};

const highRiskActions = new Set<GovernanceAction>([
  'update_prompt',
  'update_variables',
  'publish',
  'archive',
  'delete',
]);

const featuredActions = new Set<GovernanceAction>([
  'feature',
  'unfeature',
  'reorder_featured',
]);

export function classifyGovernanceRisk(
  inputValue: GovernanceRiskInput,
  rulesValue: GovernanceRuleSet,
): GovernanceRiskDecision {
  const input = governanceRiskInputSchema.parse(inputValue);
  const rules = governanceRuleSetSchema.parse(rulesValue);

  if (highRiskActions.has(input.action) || input.changedFields.some((field) =>
    rules.alwaysApprove.includes(field as GovernanceRuleSet['alwaysApprove'][number]))) {
    return { riskLevel: 'high', requiresApproval: true, automatic: false };
  }

  if (input.batchSize > rules.maximumAutoBatchSize) {
    return { riskLevel: 'high', requiresApproval: true, automatic: false };
  }

  if (input.confidence < rules.minimumAutoConfidence) {
    return { riskLevel: 'medium', requiresApproval: true, automatic: false };
  }

  if (featuredActions.has(input.action)) {
    const featured = input.featured;
    const insidePolicy = Boolean(featured)
      && featured!.resultingSlotCount <= rules.featured.slotLimit
      && featured!.replacementRatio <= rules.featured.maximumReplacementRatio
      && featured!.hoursSinceLastAdjustment >= rules.featured.minimumAdjustmentHours;
    return insidePolicy
      ? { riskLevel: 'medium', requiresApproval: false, automatic: true }
      : { riskLevel: 'high', requiresApproval: true, automatic: false };
  }

  const automaticFields = new Set<string>(rules.automaticFields);
  if (input.changedFields.some((field) => !automaticFields.has(field))) {
    return { riskLevel: 'high', requiresApproval: true, automatic: false };
  }

  return { riskLevel: 'low', requiresApproval: false, automatic: true };
}
