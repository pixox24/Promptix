import {
  boolean,
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull().default(''),
    role: text('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('admin_users_email_uidx').on(t.email)],
);

export const taxonomyTerms = pgTable(
  'taxonomy_terms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dimension: text('dimension').notNull(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    aliases: text('aliases').array().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('taxonomy_terms_dimension_slug_uidx').on(t.dimension, t.slug),
    index('taxonomy_terms_dimension_enabled_sort_idx').on(t.dimension, t.enabled, t.sortOrder, t.label),
    index('taxonomy_terms_aliases_gin_idx').using('gin', t.aliases),
    check('taxonomy_terms_dimension_check', sql`${t.dimension} in ('output_type','scenario','style','subject')`),
  ],
);

export const promptTemplates = pgTable(
  'prompt_templates',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    workflowType: text('workflow_type').notNull().default('generate'),
    outputTypeId: uuid('output_type_id').references(() => taxonomyTerms.id),
    tags: text('tags').array().notNull().default([]),
    scenarios: text('scenarios').array().notNull().default([]),
    taxonomyReviewStatus: text('taxonomy_review_status').notNull().default('pending'),
    unmappedTerms: jsonb('unmapped_terms').notNull().default([]),
    classificationMeta: jsonb('classification_meta'),
    taxonomyReviewedAt: timestamp('taxonomy_reviewed_at', { withTimezone: true }),
    taxonomyReviewedBy: uuid('taxonomy_reviewed_by').references(() => adminUsers.id),
    variables: jsonb('variables').notNull().default([]),
    promptTemplate: text('prompt_template').notNull(),
    negativePrompt: text('negative_prompt'),
    coverObjectKey: text('cover_object_key'),
    coverUrl: text('cover_url'),
    status: text('status').notNull().default('draft'),
    isFeatured: boolean('is_featured').notNull().default(false),
    featuredOrder: integer('featured_order').notNull().default(0),
    isHot: boolean('is_hot').notNull().default(false),
    favoriteCount: integer('favorite_count').notNull().default(0),
    useCount: integer('use_count').notNull().default(0),
    source: text('source').notNull().default('manual'),
    sourceMeta: jsonb('source_meta'),
    modelHints: jsonb('model_hints'),
    locale: text('locale').notNull().default('zh'),
    i18n: jsonb('i18n'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => adminUsers.id),
    deletionReason: text('deletion_reason'),
    currentVersion: integer('current_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('prompt_templates_status_category_created_idx').on(
      t.status,
      t.category,
      t.createdAt,
    ),
    index('prompt_templates_status_output_type_created_idx').on(
      t.status,
      t.outputTypeId,
      t.createdAt,
    ),
    index('prompt_templates_tags_gin_idx').using('gin', t.tags),
    index('prompt_templates_featured_rank_idx').on(
      t.status,
      t.isFeatured,
      t.featuredOrder,
      t.useCount,
      t.createdAt,
    ),
    check('prompt_templates_workflow_type_check', sql`${t.workflowType} in ('generate','edit')`),
    check('prompt_templates_taxonomy_review_status_check', sql`${t.taxonomyReviewStatus} in ('pending','needs_attention','reviewed','auto_verified')`),
  ],
);

export const templateGovernanceState = pgTable('template_governance_state', {
  templateId: text('template_id').primaryKey().references(() => promptTemplates.id, { onDelete: 'cascade' }),
  lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseToken: text('lease_token'),
  lastRunId: uuid('last_run_id'),
  lifecycleState: text('lifecycle_state').notNull().default('candidate'),
  observationUntil: timestamp('observation_until', { withTimezone: true }),
  exposureLimitedAt: timestamp('exposure_limited_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('template_governance_state_eligibility_idx').on(t.leaseUntil, t.lastScanAt),
  index('template_governance_state_lifecycle_observation_idx').on(t.lifecycleState, t.observationUntil),
]);

export const templateTaxonomyAssignments = pgTable(
  'template_taxonomy_assignments',
  {
    templateId: text('template_id').notNull().references(() => promptTemplates.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').notNull().references(() => taxonomyTerms.id),
    source: text('source').notNull().default('admin'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('template_taxonomy_assignments_template_term_uidx').on(t.templateId, t.termId),
    index('template_taxonomy_assignments_term_template_idx').on(t.termId, t.templateId),
    check('template_taxonomy_assignments_source_check', sql`${t.source} in ('ai','admin','migration')`),
    check('template_taxonomy_assignments_confidence_check', sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`),
  ],
);

export const templateAssets = pgTable('template_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateId: text('template_id')
    .notNull()
    .references(() => promptTemplates.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('sample'),
  sortOrder: integer('sort_order').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  bytes: integer('bytes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const providers = pgTable('providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  protocol: text('protocol').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  apiKeyEnv: text('api_key_env'),
  adapterType: text('adapter_type').notNull().default('openai_compatible'),
  defaultModel: text('default_model').notNull().default(''),
  defaults: jsonb('defaults').notNull().default({}),
  authStyle: text('auth_style').notNull().default('bearer'),
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const providerModels = pgTable(
  'provider_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    modelId: text('model_id').notNull(),
    capabilities: text('capabilities')
      .array()
      .notNull()
      .default(sql`ARRAY['text']::text[]`),
    defaults: jsonb('defaults').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    isDefaultText: boolean('is_default_text').notNull().default(false),
    isDefaultVision: boolean('is_default_vision').notNull().default(false),
    isDefaultImage: boolean('is_default_image').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('provider_models_provider_model_uidx').on(t.providerId, t.modelId),
    index('provider_models_provider_enabled_idx').on(t.providerId, t.enabled),
    uniqueIndex('provider_models_default_text_uidx')
      .on(t.isDefaultText)
      .where(sql`${t.isDefaultText} = true`),
    uniqueIndex('provider_models_default_vision_uidx')
      .on(t.isDefaultVision)
      .where(sql`${t.isDefaultVision} = true`),
    uniqueIndex('provider_models_default_image_uidx')
      .on(t.isDefaultImage)
      .where(sql`${t.isDefaultImage} = true`),
  ],
);

export const ingestSystemPrompts = pgTable(
  'ingest_system_prompts',
  {
    flowType: text('flow_type').primaryKey(),
    prompt: text('prompt').notNull(),
    updatedBy: uuid('updated_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ingest_system_prompts_flow_type_check',
      sql`${t.flowType} in ('text_expand', 'image_reverse')`,
    ),
    check(
      'ingest_system_prompts_prompt_length_check',
      sql`char_length(btrim(${t.prompt})) between 1 and 20000`,
    ),
  ],
);

export const governanceRuleSets = pgTable(
  'governance_rule_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    rules: jsonb('rules').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('governance_rule_sets_name_version_uidx').on(t.name, t.version),
    uniqueIndex('governance_rule_sets_single_active_uidx').on(t.enabled).where(sql`${t.enabled} = true`),
    check('governance_rule_sets_version_check', sql`${t.version} > 0`),
  ],
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    trigger: text('trigger').notNull(),
    goal: text('goal').notNull().default(''),
    scope: jsonb('scope').notNull().default({}),
    promptVersion: text('prompt_version').notNull(),
    ruleSetId: uuid('rule_set_id').notNull().references(() => governanceRuleSets.id),
    ruleSetVersion: integer('rule_set_version').notNull(),
    modelId: uuid('model_id').references(() => providerModels.id),
    status: text('status').notNull().default('queued'),
    progress: jsonb('progress'),
    stats: jsonb('stats'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    requestedBy: uuid('requested_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('agent_runs_status_created_idx').on(t.status, t.createdAt),
    index('agent_runs_rule_set_created_idx').on(t.ruleSetId, t.createdAt),
    check('agent_runs_trigger_check', sql`${t.trigger} in ('scheduled','manual')`),
    check('agent_runs_status_check', sql`${t.status} in ('queued','analyzing','planned','auto_executing','awaiting_approval','partially_succeeded','succeeded','failed','cancelled')`),
  ],
);

export const governanceChangeSets = pgTable(
  'governance_change_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').notNull().references(() => agentRuns.id),
    scopeSnapshot: jsonb('scope_snapshot').notNull(),
    exclusionIds: text('exclusion_ids').array().notNull().default([]),
    ruleSetId: uuid('rule_set_id').notNull().references(() => governanceRuleSets.id),
    ruleSetVersion: integer('rule_set_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    permitId: uuid('permit_id').references((): AnyPgColumn => governanceExecutionPermits.id),
    executionMode: text('execution_mode').notNull().default('automatic'),
    status: text('status').notNull().default('planned'),
    summary: jsonb('summary').notNull().default({}),
    rollbackUntil: timestamp('rollback_until', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('governance_change_sets_idempotency_key_uidx').on(t.idempotencyKey),
    index('governance_change_sets_run_status_idx').on(t.runId, t.status),
    check('governance_change_sets_status_check', sql`${t.status} in ('planned','auto_executing','awaiting_approval','approved','rejected','partially_succeeded','succeeded','failed','cancelled','rollback_available','rolled_back')`),
    uniqueIndex('governance_change_sets_permit_unique').on(t.permitId).where(sql`${t.permitId} is not null`),
    check('governance_change_sets_execution_mode_check', sql`${t.executionMode} in ('automatic','approval','legacy_mixed','autopilot')`),
  ],
);

export const templateVersions = pgTable(
  'template_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    templateId: text('template_id').notNull().references(() => promptTemplates.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    source: text('source').notNull(),
    actorId: uuid('actor_id').references(() => adminUsers.id),
    runId: uuid('run_id').references(() => agentRuns.id),
    changeSetId: uuid('change_set_id').references(() => governanceChangeSets.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('template_versions_template_version_uidx').on(t.templateId, t.version),
    index('template_versions_change_set_idx').on(t.changeSetId),
    check('template_versions_version_check', sql`${t.version} > 0`),
    check('template_versions_source_check', sql`${t.source} in ('admin','agent','rollback','migration')`),
  ],
);

export const governanceProposals = pgTable(
  'governance_proposals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull().references(() => promptTemplates.id, { onDelete: 'cascade' }),
    baseVersion: integer('base_version').notNull(),
    currentSnapshot: jsonb('current_snapshot').notNull(),
    action: text('action').notNull(),
    proposedPatch: jsonb('proposed_patch').notNull().default({}),
    reasonCodes: text('reason_codes').array().notNull().default([]),
    explanation: text('explanation').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    riskLevel: text('risk_level').notNull(),
    requiresApproval: boolean('requires_approval').notNull(),
    validation: jsonb('validation').notNull().default({}),
    status: text('status').notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('governance_proposals_run_template_uidx').on(t.runId, t.templateId),
    index('governance_proposals_template_status_idx').on(t.templateId, t.status),
    index('governance_proposals_run_status_idx').on(t.runId, t.status),
    check('governance_proposals_base_version_check', sql`${t.baseVersion} > 0`),
    check('governance_proposals_confidence_check', sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
    check('governance_proposals_risk_level_check', sql`${t.riskLevel} in ('low','medium','high')`),
    check('governance_proposals_status_check', sql`${t.status} in ('planned','accepted','skipped','awaiting_approval','approved','rejected','applied','conflict','failed','rolled_back')`),
  ],
);

export const governanceChangeSetItems = pgTable(
  'governance_change_set_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    changeSetId: uuid('change_set_id').notNull().references(() => governanceChangeSets.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').notNull().references(() => governanceProposals.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull().references(() => promptTemplates.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    appliedVersion: integer('applied_version'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('governance_change_set_items_change_set_proposal_uidx').on(t.changeSetId, t.proposalId),
    uniqueIndex('governance_change_set_items_proposal_uidx').on(t.proposalId),
    index('governance_change_set_items_change_set_status_idx').on(t.changeSetId, t.status),
    check('governance_change_set_items_status_check', sql`${t.status} in ('pending','awaiting_approval','queued','running','applied','skipped','conflict','failed','rejected','rolled_back')`),
  ],
);

export const governanceApprovals = pgTable(
  'governance_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    changeSetId: uuid('change_set_id').notNull().references(() => governanceChangeSets.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(),
    approvedScope: jsonb('approved_scope').notNull(),
    reviewerId: uuid('reviewer_id').notNull().references(() => adminUsers.id),
    note: text('note').notNull().default(''),
    ruleSetVersion: integer('rule_set_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('governance_approvals_change_set_created_idx').on(t.changeSetId, t.createdAt),
    check('governance_approvals_decision_check', sql`${t.decision} in ('approved','rejected')`),
  ],
);

export const governanceOperationIdempotency = pgTable('governance_operation_idempotency', {
  operationKey: text('operation_key').primaryKey(),
  operation: text('operation').notNull(),
  response: jsonb('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceAuditEvents = pgTable(
  'governance_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id').references(() => adminUsers.id),
    eventType: text('event_type').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    runId: uuid('run_id').references(() => agentRuns.id),
    changeSetId: uuid('change_set_id').references(() => governanceChangeSets.id),
    proposalId: uuid('proposal_id').references(() => governanceProposals.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('governance_audit_events_target_created_idx').on(t.targetType, t.targetId, t.createdAt),
    index('governance_audit_events_change_set_created_idx').on(t.changeSetId, t.createdAt),
    check('governance_audit_events_actor_type_check', sql`${t.actorType} in ('admin','agent','system')`),
  ],
);

export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    actorType: text('actor_type').notNull().default('admin'),
    actorId: uuid('actor_id'),
    providerId: uuid('provider_id').references(() => providers.id),
    modelId: uuid('model_id').references(() => providerModels.id),
    visionModelId: uuid('vision_model_id').references(() => providerModels.id),
    queueName: text('queue_name'),
    bullJobId: text('bull_job_id'),
    attempts: integer('attempts').notNull().default(0),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output'),
    templateId: text('template_id').references(() => promptTemplates.id, { onDelete: 'set null' }),
    ownerKeyHash: text('owner_key_hash'),
    usageRecordedAt: timestamp('usage_recorded_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    errorCode: text('error_code'),
    errorDetails: jsonb('error_details'),
    progress: jsonb('progress'),
    resultMeta: jsonb('result_meta'),
    autopublishRunId: uuid('autopublish_run_id').references((): AnyPgColumn => templateAutopublishRuns.id),
    autopublishStage: text('autopublish_stage'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('generation_jobs_status_created_idx').on(t.status, t.createdAt),
    index('generation_jobs_owner_status_idx').on(t.ownerKeyHash, t.status),
  ],
);

export const agentCapabilityGrants = pgTable(
  'agent_capability_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    triggerType: text('trigger_type').notNull(),
    agentId: text('agent_id').notNull(),
    initiatedBy: uuid('initiated_by').references(() => adminUsers.id),
    scopes: text('scopes').array().notNull().default([]),
    inputSnapshotHash: text('input_snapshot_hash'),
    sourceConstraints: jsonb('source_constraints').notNull().default({}),
    budget: jsonb('budget').notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('agent_capability_grants_trigger_type_check', sql`${t.triggerType} in ('delegated','scheduled_agent')`)],
);

export const templateAutopublishSourceItems = pgTable(
  'template_autopublish_source_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceType: text('source_type').notNull(),
    sourceItemId: text('source_item_id').notNull(),
    flowType: text('flow_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    leaseToken: text('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('template_autopublish_source_items_source_item_flow_unique').on(t.sourceType, t.sourceItemId, t.flowType),
    index('template_autopublish_source_items_lease_idx').on(t.status, t.leaseUntil),
    check('template_autopublish_source_items_flow_type_check', sql`${t.flowType} in ('text_expand','image_reverse')`),
    check('template_autopublish_source_items_status_check', sql`${t.status} in ('pending','leased','completed','failed','cancelled')`),
  ],
);

export const templateAutopublishRuns = pgTable(
  'template_autopublish_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: text('status').notNull().default('queued'),
    currentStage: text('current_stage').notNull().default('queued'),
    triggerType: text('trigger_type').notNull(),
    requestedBy: uuid('requested_by').references(() => adminUsers.id),
    agentId: text('agent_id'),
    capabilityGrantId: uuid('capability_grant_id').notNull().references(() => agentCapabilityGrants.id),
    flowType: text('flow_type').notNull(),
    sourceType: text('source_type').notNull(),
    sourceItemId: text('source_item_id').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    inputSnapshotHash: text('input_snapshot_hash').notNull(),
    ruleSetId: uuid('rule_set_id').notNull().references(() => governanceRuleSets.id),
    ruleSetVersion: integer('rule_set_version').notNull(),
    taxonomySnapshotHash: text('taxonomy_snapshot_hash').notNull(),
    promptVersion: text('prompt_version').notNull(),
    budgetSnapshot: jsonb('budget_snapshot').notNull(),
    budgetConsumed: jsonb('budget_consumed').notNull().default({}),
    repairCount: integer('repair_count').notNull().default(0),
    templateId: text('template_id').references(() => promptTemplates.id),
    changeSetId: uuid('change_set_id').references(() => governanceChangeSets.id),
    idempotencyKey: text('idempotency_key').notNull(),
    leaseToken: text('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    errorCode: text('error_code'),
    errorDetails: jsonb('error_details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('template_autopublish_runs_idempotency_key_unique').on(t.idempotencyKey),
    uniqueIndex('template_autopublish_runs_scheduled_source_unique').on(t.sourceType, t.sourceItemId, t.flowType).where(sql`${t.triggerType} = 'scheduled_agent'`),
    index('template_autopublish_runs_status_created_idx').on(t.status, t.createdAt),
    check('template_autopublish_runs_status_check', sql`${t.status} in ('queued','running','conflict_waiting','needs_attention','duplicate_found','rejected','succeeded','failed','cancelled')`),
    check('template_autopublish_runs_trigger_type_check', sql`${t.triggerType} in ('delegated','scheduled_agent')`),
    check('template_autopublish_runs_flow_type_check', sql`${t.flowType} in ('text_expand','image_reverse')`),
    check('template_autopublish_runs_repair_count_check', sql`${t.repairCount} between 0 and 2`),
  ],
);

export const templateAutopublishArtifacts = pgTable(
  'template_autopublish_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').notNull().references(() => templateAutopublishRuns.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    payload: jsonb('payload').notNull(),
    modelId: uuid('model_id').references(() => providerModels.id),
    promptVersion: text('prompt_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('template_autopublish_artifacts_run_kind_content_unique').on(t.runId, t.kind, t.contentHash)],
);

export const templateAutopublishStageAttempts = pgTable(
  'template_autopublish_stage_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').notNull().references(() => templateAutopublishRuns.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    attempt: integer('attempt').notNull(),
    status: text('status').notNull(),
    inputHash: text('input_hash').notNull(),
    artifactId: uuid('artifact_id').references(() => templateAutopublishArtifacts.id),
    generationJobId: uuid('generation_job_id').references(() => generationJobs.id),
    usage: jsonb('usage').notNull().default({}),
    errorCode: text('error_code'),
    errorDetails: jsonb('error_details'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('template_autopublish_stage_attempts_run_stage_attempt_unique').on(t.runId, t.stage, t.attempt),
    index('template_autopublish_stage_attempts_run_stage_status_idx').on(t.runId, t.stage, t.status),
    check('template_autopublish_stage_attempts_attempt_check', sql`${t.attempt} > 0`),
    check('template_autopublish_stage_attempts_status_check', sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`),
  ],
);

export const templateAutopublishOutbox = pgTable(
  'template_autopublish_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id').notNull().references(() => templateAutopublishRuns.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payload: jsonb('payload').notNull().default({}),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    leaseToken: text('lease_token'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('template_autopublish_outbox_dedupe_key_unique').on(t.dedupeKey),
    index('template_autopublish_outbox_pending_idx').on(t.availableAt).where(sql`${t.dispatchedAt} is null`),
  ],
);

export const governanceExecutionPermits = pgTable(
  'governance_execution_permits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    autopublishRunId: uuid('autopublish_run_id').notNull().references(() => templateAutopublishRuns.id, { onDelete: 'cascade' }),
    templateId: text('template_id').notNull().references(() => promptTemplates.id),
    templateVersion: integer('template_version').notNull(),
    ruleSetId: uuid('rule_set_id').notNull().references(() => governanceRuleSets.id),
    ruleSetVersion: integer('rule_set_version').notNull(),
    action: text('action').notNull(),
    contentHash: text('content_hash').notNull(),
    permitHash: text('permit_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('governance_execution_permits_permit_hash_unique').on(t.permitHash),
    index('governance_execution_permits_expiry_idx').on(t.expiresAt),
    check('governance_execution_permits_action_check', sql`${t.action} = 'publish'`),
  ],
);

export const templateRecommendationRequests = pgTable(
  'template_recommendation_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceTemplateId: text('source_template_id').notNull()
      .references(() => promptTemplates.id, { onDelete: 'cascade' }),
    algorithmVersion: text('algorithm_version').notNull(),
    candidateIds: text('candidate_ids').array().notNull(),
    scoreSnapshot: jsonb('score_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('template_recommendation_requests_source_created_idx')
      .on(t.sourceTemplateId, t.createdAt),
    index('template_recommendation_requests_expires_idx').on(t.expiresAt),
  ],
);

export const templateRecommendationEvents = pgTable(
  'template_recommendation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id').notNull()
      .references(() => templateRecommendationRequests.id, { onDelete: 'cascade' }),
    sourceTemplateId: text('source_template_id').notNull()
      .references(() => promptTemplates.id, { onDelete: 'cascade' }),
    recommendedTemplateId: text('recommended_template_id').notNull()
      .references(() => promptTemplates.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    position: integer('position').notNull(),
    generationJobId: uuid('generation_job_id')
      .references(() => generationJobs.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('template_recommendation_events_dedupe_key_uidx').on(t.dedupeKey),
    index('template_recommendation_events_pair_type_created_idx')
      .on(t.sourceTemplateId, t.recommendedTemplateId, t.eventType, t.createdAt),
    index('template_recommendation_events_request_created_idx')
      .on(t.requestId, t.createdAt),
    check(
      'template_recommendation_events_event_type_check',
      sql`${t.eventType} in ('impression','click','generation_succeeded')`,
    ),
    check(
      'template_recommendation_events_position_check',
      sql`${t.position} between 1 and 12`,
    ),
  ],
);

export const mediaObjects = pgTable(
  'media_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    objectKey: text('object_key').notNull(),
    bucket: text('bucket').notNull(),
    url: text('url').notNull(),
    storageClass: text('storage_class').notNull().default('temp'),
    prefixKind: text('prefix_kind').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ownerType: text('owner_type'),
    ownerId: text('owner_id'),
    jobId: uuid('job_id').references(() => generationJobs.id),
    mime: text('mime'),
    bytes: integer('bytes'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('media_objects_object_key_uidx').on(t.objectKey),
    index('media_objects_storage_expires_idx').on(t.storageClass, t.expiresAt),
  ],
);
