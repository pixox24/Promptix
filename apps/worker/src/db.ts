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
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  providerId: uuid('provider_id'),
  modelId: uuid('model_id'),
  attempts: integer('attempts').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  templateId: text('template_id'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

const sqlClient = postgres(required('DATABASE_URL'), { max: 5 });
export const db = drizzle(sqlClient);
