import {
  boolean,
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
    check('prompt_templates_taxonomy_review_status_check', sql`${t.taxonomyReviewStatus} in ('pending','needs_attention','reviewed')`),
  ],
);

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
    templateId: text('template_id').references(() => promptTemplates.id),
    ownerKeyHash: text('owner_key_hash'),
    usageRecordedAt: timestamp('usage_recorded_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    errorCode: text('error_code'),
    errorDetails: jsonb('error_details'),
    progress: jsonb('progress'),
    resultMeta: jsonb('result_meta'),
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
