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
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const promptTemplates = pgTable('prompt_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), summary: text('summary').notNull(), description: text('description').notNull(), category: text('category').notNull(), workflowType: text('workflow_type').notNull(), outputTypeId: uuid('output_type_id'), tags: text('tags').array().notNull(), scenarios: text('scenarios').array().notNull(), taxonomyReviewStatus: text('taxonomy_review_status').notNull(), unmappedTerms: jsonb('unmapped_terms').notNull(), classificationMeta: jsonb('classification_meta'), variables: jsonb('variables').notNull(), promptTemplate: text('prompt_template').notNull(), negativePrompt: text('negative_prompt'), coverObjectKey: text('cover_object_key'), coverUrl: text('cover_url'), status: text('status').notNull(), isFeatured: boolean('is_featured').notNull(), featuredOrder: integer('featured_order').notNull(), source: text('source').notNull(), locale: text('locale').notNull(), currentVersion: integer('current_version').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  useCount: integer('use_count').notNull(),
});

export const templateVersions = pgTable('template_versions', { id: uuid('id').defaultRandom().primaryKey(), templateId: text('template_id').notNull(), version: integer('version').notNull(), snapshot: jsonb('snapshot').notNull(), source: text('source').notNull(), runId: uuid('run_id'), changeSetId: uuid('change_set_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() });
export const taxonomyTerms = pgTable('taxonomy_terms', { id: uuid('id').primaryKey(), dimension: text('dimension').notNull(), slug: text('slug').notNull(), label: text('label').notNull() });
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
  status: text('status').notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceProposals = pgTable('governance_proposals', {
  id: uuid('id').defaultRandom().primaryKey(), runId: uuid('run_id').notNull(), templateId: text('template_id').notNull(), baseVersion: integer('base_version').notNull(), currentSnapshot: jsonb('current_snapshot').notNull(), action: text('action').notNull(), proposedPatch: jsonb('proposed_patch').notNull(), reasonCodes: text('reason_codes').array().notNull(), explanation: text('explanation').notNull(), confidence: text('confidence').notNull(), riskLevel: text('risk_level').notNull(), requiresApproval: boolean('requires_approval').notNull(), validation: jsonb('validation').notNull(), status: text('status').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceChangeSets = pgTable('governance_change_sets', {
  id: uuid('id').defaultRandom().primaryKey(), runId: uuid('run_id').notNull(), scopeSnapshot: jsonb('scope_snapshot').notNull(), exclusionIds: text('exclusion_ids').array().notNull(), ruleSetId: uuid('rule_set_id').notNull(), ruleSetVersion: integer('rule_set_version').notNull(), idempotencyKey: text('idempotency_key').notNull(), status: text('status').notNull(), summary: jsonb('summary').notNull(), rollbackUntil: timestamp('rollback_until', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const governanceChangeSetItems = pgTable('governance_change_set_items', {
  id: uuid('id').defaultRandom().primaryKey(), changeSetId: uuid('change_set_id').notNull(), proposalId: uuid('proposal_id').notNull(), templateId: text('template_id').notNull(), status: text('status').notNull(), appliedVersion: integer('applied_version'), errorCode: text('error_code'), errorMessage: text('error_message'), finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const mediaObjects = pgTable('media_objects', {
  id: uuid('id').defaultRandom().primaryKey(), objectKey:text('object_key').notNull(), bucket:text('bucket').notNull(), url:text('url').notNull(), storageClass:text('storage_class').notNull(), prefixKind:text('prefix_kind').notNull(), expiresAt:timestamp('expires_at',{withTimezone:true}), ownerType:text('owner_type'), ownerId:text('owner_id'), jobId:uuid('job_id'), mime:text('mime'), bytes:integer('bytes'), width:integer('width'), height:integer('height'), createdAt:timestamp('created_at',{withTimezone:true}).notNull(), deletedAt:timestamp('deleted_at',{withTimezone:true}),
});

const sqlClient = postgres(required('DATABASE_URL'), { max: 5 });
export const db = drizzle(sqlClient);
