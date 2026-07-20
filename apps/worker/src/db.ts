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
  useCount: integer('use_count').notNull(),
});

export const mediaObjects = pgTable('media_objects', {
  id: uuid('id').defaultRandom().primaryKey(), objectKey:text('object_key').notNull(), bucket:text('bucket').notNull(), url:text('url').notNull(), storageClass:text('storage_class').notNull(), prefixKind:text('prefix_kind').notNull(), expiresAt:timestamp('expires_at',{withTimezone:true}), ownerType:text('owner_type'), ownerId:text('owner_id'), jobId:uuid('job_id'), mime:text('mime'), bytes:integer('bytes'), width:integer('width'), height:integer('height'), createdAt:timestamp('created_at',{withTimezone:true}).notNull(), deletedAt:timestamp('deleted_at',{withTimezone:true}),
});

const sqlClient = postgres(required('DATABASE_URL'), { max: 5 });
export const db = drizzle(sqlClient);
