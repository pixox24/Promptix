import { drizzle } from 'drizzle-orm/postgres-js';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { required } from './env.js';

export const providers=pgTable('providers',{
  id:uuid('id').primaryKey(),name:text('name').notNull(),kind:text('kind').notNull(),protocol:text('protocol').notNull(),
  baseUrl:text('base_url').notNull(),apiKeyEnv:text('api_key_env'),defaultModel:text('default_model').notNull(),
  defaults:jsonb('defaults').notNull(),authStyle:text('auth_style').notNull(),isDefault:boolean('is_default').notNull(),enabled:boolean('enabled').notNull(),
});
export const generationJobs=pgTable('generation_jobs',{
  id:uuid('id').primaryKey(),type:text('type').notNull(),status:text('status').notNull(),providerId:uuid('provider_id'),
  attempts:integer('attempts').notNull(),input:jsonb('input').notNull(),output:jsonb('output'),templateId:text('template_id'),
  errorMessage:text('error_message'),startedAt:timestamp('started_at',{withTimezone:true}),finishedAt:timestamp('finished_at',{withTimezone:true}),
});
const sql=postgres(required('DATABASE_URL'),{max:5});
export const db=drizzle(sql);
