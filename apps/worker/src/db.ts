import { drizzle } from 'drizzle-orm/postgres-js';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { required } from './env.js';

export const providers = pgTable('providers', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  protocol: text('protocol').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKeyEnv: text('api_key_env'),
  adapterType: text('adapter_type').notNull(),
  defaultModel: text('default_model').notNull(),
  defaults: jsonb('defaults').notNull(),
  authStyle: text('auth_style').notNull(),
  isDefault: boolean('is_default').notNull(),
  enabled: boolean('enabled').notNull(),
});

export const providerModels = pgTable('provider_models', {
  id: uuid('id').primaryKey(),
  providerId: uuid('provider_id').notNull(),
  name: text('name').notNull(),
  modelId: text('model_id').notNull(),
  capabilities: text('capabilities').array().notNull(),
  defaults: jsonb('defaults').notNull(),
  enabled: boolean('enabled').notNull(),
  isDefaultText: boolean('is_default_text').notNull(),
  isDefaultVision: boolean('is_default_vision').notNull(),
  isDefaultImage: boolean('is_default_image').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  providerId: uuid('provider_id'),
  modelId: uuid('model_id'),
  visionModelId: uuid('vision_model_id'),
  attempts: integer('attempts').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  templateId: text('template_id'),
  usageRecordedAt: timestamp('usage_recorded_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  errorCode: text('error_code'),
  errorDetails: jsonb('error_details'),
  progress: jsonb('progress'),
  resultMeta: jsonb('result_meta'),
  autopublishRunId: uuid('autopublish_run_id'),
  autopublishStage: text('autopublish_stage'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const promptTemplates = pgTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), summary: text('summary').notNull(), description: text('description').notNull(), category: text('category').notNull(), workflowType: text('workflow_type').notNull(), outputTypeId: uuid('output_type_id'), tags: text('tags').array().notNull(), scenarios: text('scenarios').array().notNull(), taxonomyReviewStatus: text('taxonomy_review_status').notNull(), taxonomyReviewedAt: timestamp('taxonomy_reviewed_at', { withTimezone: true }), taxonomyReviewedBy: uuid('taxonomy_reviewed_by'), unmappedTerms: jsonb('unmapped_terms').notNull(), classificationMeta: jsonb('classification_meta'), variables: jsonb('variables').notNull(), promptTemplate: text('prompt_template').notNull(), negativePrompt: text('negative_prompt'), coverObjectKey: text('cover_object_key'), coverUrl: text('cover_url'), status: text('status').notNull(), publishedAt: timestamp('published_at', { withTimezone: true }), isFeatured: boolean('is_featured').notNull(), featuredOrder: integer('featured_order').notNull(), isHot: boolean('is_hot').notNull(), source: text('source').notNull(), sourceMeta: jsonb('source_meta'), modelHints: jsonb('model_hints'), i18n: jsonb('i18n'), locale: text('locale').notNull(), currentVersion: integer('current_version').notNull(), deletedAt: timestamp('deleted_at', { withTimezone: true }), deletedBy: uuid('deleted_by'), deletionReason: text('deletion_reason'), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  useCount: integer('use_count').notNull(),
});

export const templateRecommendationRequests = pgTable('template_recommendation_requests', {
  id: uuid('id').primaryKey(),
  sourceTemplateId: text('source_template_id').notNull(),
  algorithmVersion: text('algorithm_version').notNull(),
  candidateIds: text('candidate_ids').array().notNull(),
  scoreSnapshot: jsonb('score_snapshot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const templateRecommendationEvents = pgTable('template_recommendation_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull(),
  sourceTemplateId: text('source_template_id').notNull(),
  recommendedTemplateId: text('recommended_template_id').notNull(),
  eventType: text('event_type').notNull(),
  position: integer('position').notNull(),
  generationJobId: uuid('generation_job_id'),
  dedupeKey: text('dedupe_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('template_recommendation_events_dedupe_key_uidx').on(table.dedupeKey),
]);

export const templateGovernanceState = pgTable('template_governance_state', {
  templateId: text('template_id').primaryKey(), lastScanAt: timestamp('last_scan_at', { withTimezone: true }), leaseUntil: timestamp('lease_until', { withTimezone: true }), leaseToken: text('lease_token'), lastRunId: uuid('last_run_id'), lifecycleState: text('lifecycle_state').notNull().default('candidate'), observationUntil: timestamp('observation_until', { withTimezone: true }), exposureLimitedAt: timestamp('exposure_limited_at', { withTimezone: true }), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('template_governance_state_lifecycle_observation_idx').on(t.lifecycleState, t.observationUntil),
]);

export const templateVersions = pgTable('template_versions', { id: uuid('id').defaultRandom().primaryKey(), templateId: text('template_id').notNull(), version: integer('version').notNull(), snapshot: jsonb('snapshot').notNull(), source: text('source').notNull(), runId: uuid('run_id'), changeSetId: uuid('change_set_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() });
export const taxonomyTerms = pgTable('taxonomy_terms', { id: uuid('id').primaryKey(), dimension: text('dimension').notNull(), slug: text('slug').notNull(), label: text('label').notNull(), enabled: boolean('enabled').notNull() });
export const templateTaxonomyAssignments = pgTable('template_taxonomy_assignments', { templateId: text('template_id').notNull(), termId: uuid('term_id').notNull(), source: text('source').notNull(), confidence: text('confidence'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });

export const governanceRuleSets = pgTable('governance_rule_sets', {
  id: uuid('id').primaryKey(),
  version: integer('version').notNull(),
  rules: jsonb('rules').notNull(),
  enabled: boolean('enabled').notNull(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  trigger: text('trigger').notNull(),
  goal: text('goal').notNull(),
  scope: jsonb('scope').notNull(),
  promptVersion: text('prompt_version').notNull(),
  ruleSetId: uuid('rule_set_id').notNull(),
  ruleSetVersion: integer('rule_set_version').notNull(),
  modelId: uuid('model_id'),
  status: text('status').notNull(),
  progress: jsonb('progress'),
  stats: jsonb('stats'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceProposals = pgTable('governance_proposals', {
  id: uuid('id').defaultRandom().primaryKey(), runId: uuid('run_id').notNull(), templateId: text('template_id').notNull(), baseVersion: integer('base_version').notNull(), currentSnapshot: jsonb('current_snapshot').notNull(), action: text('action').notNull(), proposedPatch: jsonb('proposed_patch').notNull(), reasonCodes: text('reason_codes').array().notNull(), explanation: text('explanation').notNull(), confidence: text('confidence').notNull(), riskLevel: text('risk_level').notNull(), requiresApproval: boolean('requires_approval').notNull(), validation: jsonb('validation').notNull(), status: text('status').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceChangeSets = pgTable('governance_change_sets', {
  id: uuid('id').defaultRandom().primaryKey(), runId: uuid('run_id').notNull(), scopeSnapshot: jsonb('scope_snapshot').notNull(), exclusionIds: text('exclusion_ids').array().notNull(), ruleSetId: uuid('rule_set_id').notNull(), ruleSetVersion: integer('rule_set_version').notNull(), idempotencyKey: text('idempotency_key').notNull(), permitId: uuid('permit_id'), executionMode: text('execution_mode').notNull(), status: text('status').notNull(), summary: jsonb('summary').notNull(), rollbackUntil: timestamp('rollback_until', { withTimezone: true }), executedAt: timestamp('executed_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('governance_change_sets_permit_unique').on(t.permitId).where(sql`${t.permitId} is not null`),
]);

export const agentCapabilityGrants = pgTable('agent_capability_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  triggerType: text('trigger_type').notNull(),
  agentId: text('agent_id').notNull(),
  initiatedBy: uuid('initiated_by'),
  scopes: text('scopes').array().notNull().default([]),
  inputSnapshotHash: text('input_snapshot_hash'),
  sourceConstraints: jsonb('source_constraints').notNull().default({}),
  budget: jsonb('budget').notNull().default({}),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const templateAutopublishSourceItems = pgTable('template_autopublish_source_items', {
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
}, (t) => [
  uniqueIndex('template_autopublish_source_items_source_item_flow_unique').on(t.sourceType, t.sourceItemId, t.flowType),
  index('template_autopublish_source_items_lease_idx').on(t.status, t.leaseUntil),
]);

export const templateAutopublishRuns = pgTable('template_autopublish_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').notNull().default('queued'),
  currentStage: text('current_stage').notNull().default('queued'),
  triggerType: text('trigger_type').notNull(),
  requestedBy: uuid('requested_by'),
  agentId: text('agent_id'),
  capabilityGrantId: uuid('capability_grant_id').notNull(),
  flowType: text('flow_type').notNull(),
  sourceType: text('source_type').notNull(),
  sourceItemId: text('source_item_id').notNull(),
  inputSnapshot: jsonb('input_snapshot').notNull(),
  inputSnapshotHash: text('input_snapshot_hash').notNull(),
  ruleSetId: uuid('rule_set_id').notNull(),
  ruleSetVersion: integer('rule_set_version').notNull(),
  taxonomySnapshotHash: text('taxonomy_snapshot_hash').notNull(),
  promptVersion: text('prompt_version').notNull(),
  budgetSnapshot: jsonb('budget_snapshot').notNull(),
  budgetConsumed: jsonb('budget_consumed').notNull().default({}),
  repairCount: integer('repair_count').notNull().default(0),
  templateId: text('template_id'),
  changeSetId: uuid('change_set_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  errorCode: text('error_code'),
  errorDetails: jsonb('error_details'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('template_autopublish_runs_idempotency_key_unique').on(t.idempotencyKey),
  uniqueIndex('template_autopublish_runs_scheduled_source_unique').on(t.sourceType, t.sourceItemId, t.flowType).where(sql`${t.triggerType} = 'scheduled_agent'`),
  index('template_autopublish_runs_status_created_idx').on(t.status, t.createdAt),
]);

export const templateAutopublishArtifacts = pgTable('template_autopublish_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  kind: text('kind').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  contentHash: text('content_hash').notNull(),
  payload: jsonb('payload').notNull(),
  modelId: uuid('model_id'),
  promptVersion: text('prompt_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('template_autopublish_artifacts_run_kind_content_unique').on(t.runId, t.kind, t.contentHash)]);

export const templateAutopublishStageAttempts = pgTable('template_autopublish_stage_attempts', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  stage: text('stage').notNull(),
  attempt: integer('attempt').notNull(),
  status: text('status').notNull(),
  inputHash: text('input_hash').notNull(),
  artifactId: uuid('artifact_id'),
  generationJobId: uuid('generation_job_id'),
  usage: jsonb('usage').notNull().default({}),
  errorCode: text('error_code'),
  errorDetails: jsonb('error_details'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('template_autopublish_stage_attempts_run_stage_attempt_unique').on(t.runId, t.stage, t.attempt),
  index('template_autopublish_stage_attempts_run_stage_status_idx').on(t.runId, t.stage, t.status),
]);

export const templateAutopublishOutbox = pgTable('template_autopublish_outbox', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull(),
  eventType: text('event_type').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').notNull().default({}),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  leaseToken: text('lease_token'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('template_autopublish_outbox_dedupe_key_unique').on(t.dedupeKey),
  index('template_autopublish_outbox_pending_idx').on(t.availableAt).where(sql`${t.dispatchedAt} is null`),
]);

export const governanceExecutionPermits = pgTable('governance_execution_permits', {
  id: uuid('id').defaultRandom().primaryKey(),
  autopublishRunId: uuid('autopublish_run_id').notNull(),
  templateId: text('template_id').notNull(),
  templateVersion: integer('template_version').notNull(),
  ruleSetId: uuid('rule_set_id').notNull(),
  ruleSetVersion: integer('rule_set_version').notNull(),
  action: text('action').notNull(),
  contentHash: text('content_hash').notNull(),
  permitHash: text('permit_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('governance_execution_permits_permit_hash_unique').on(t.permitHash),
  index('governance_execution_permits_expiry_idx').on(t.expiresAt),
]);

export const governanceChangeSetItems = pgTable('governance_change_set_items', {
  id: uuid('id').defaultRandom().primaryKey(), changeSetId: uuid('change_set_id').notNull(), proposalId: uuid('proposal_id').notNull(), templateId: text('template_id').notNull(), status: text('status').notNull(), appliedVersion: integer('applied_version'), errorCode: text('error_code'), errorMessage: text('error_message'), startedAt: timestamp('started_at', { withTimezone: true }), finishedAt: timestamp('finished_at', { withTimezone: true }),
});
export const governanceApprovals = pgTable('governance_approvals', {
  id: uuid('id').defaultRandom().primaryKey(), changeSetId: uuid('change_set_id').notNull(), decision: text('decision').notNull(), approvedScope: jsonb('approved_scope').notNull(), reviewerId: uuid('reviewer_id').notNull(), note: text('note').notNull(), ruleSetVersion: integer('rule_set_version').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const governanceAuditEvents = pgTable('governance_audit_events', {
  id: uuid('id').defaultRandom().primaryKey(), actorType: text('actor_type').notNull(), actorId: uuid('actor_id'), eventType: text('event_type').notNull(), targetType: text('target_type').notNull(), targetId: text('target_id').notNull(), runId: uuid('run_id'), changeSetId: uuid('change_set_id'), proposalId: uuid('proposal_id'), payload: jsonb('payload').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mediaObjects = pgTable('media_objects', {
  id: uuid('id').defaultRandom().primaryKey(), objectKey:text('object_key').notNull(), bucket:text('bucket').notNull(), url:text('url').notNull(), storageClass:text('storage_class').notNull(), prefixKind:text('prefix_kind').notNull(), expiresAt:timestamp('expires_at',{withTimezone:true}), ownerType:text('owner_type'), ownerId:text('owner_id'), jobId:uuid('job_id'), mime:text('mime'), bytes:integer('bytes'), width:integer('width'), height:integer('height'), createdAt:timestamp('created_at',{withTimezone:true}).notNull(), deletedAt:timestamp('deleted_at',{withTimezone:true}),
});

const sqlClient = postgres(required('DATABASE_URL'), { max: 5 });
export const db = drizzle(sqlClient);
