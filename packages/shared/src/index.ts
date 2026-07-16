import { z } from 'zod';

export const PROMPTIX_VERSION = '0.0.0' as const;

/** Variable types for modular prompts */
export const variableTypeSchema = z.enum([
  'text',
  'select',
  'number',
  'ratio',
  'image',
]);
export type VariableType = z.infer<typeof variableTypeSchema>;

export const promptVariableSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(1),
  type: variableTypeSchema,
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type PromptVariable = z.infer<typeof promptVariableSchema>;

export const templateCategorySchema = z.enum([
  'portrait',
  'ecommerce',
  'poster',
  'logo',
  'illustration',
  'edit',
]);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

export const templateStatusSchema = z.enum(['draft', 'published', 'archived']);
export type TemplateStatus = z.infer<typeof templateStatusSchema>;

export const templateSourceSchema = z.enum([
  'manual',
  'image_reverse',
  'text_expand',
]);
export type TemplateSource = z.infer<typeof templateSourceSchema>;

/** LLM structured draft before save */
export const templateDraftSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  category: templateCategorySchema,
  tags: z.array(z.string()).default([]),
  scenarios: z.array(z.string()).default([]),
  variables: z.array(promptVariableSchema).min(1).max(12),
  promptTemplate: z.string().min(1),
  negativePrompt: z.string().optional(),
});
export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export const publishableTemplateSchema = templateDraftSchema.extend({
  coverObjectKey: z.string().min(1),
});

export const jobTypeSchema = z.enum([
  'noop',
  'image_reverse',
  'text_expand',
  'image_generate',
  'structure',
]);
export type JobType = z.infer<typeof jobTypeSchema>;

export const jobStatusSchema = z.enum([
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const providerKindSchema = z.enum(['image', 'llm', 'both']);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerProtocolSchema = z.enum([
  'openai_chat',
  'deepseek_chat',
  'openai_images',
  'openai_images_async',
  'generic_http',
]);
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>;

export const storageClassSchema = z.enum(['temp', 'permanent']);
export type StorageClass = z.infer<typeof storageClassSchema>;

/** Public template shape for frontend */
export const publicTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  coverImage: z.string(),
  category: templateCategorySchema,
  tags: z.array(z.string()),
  variables: z.array(promptVariableSchema),
  promptTemplate: z.string(),
  negativePrompt: z.string().nullable().optional(),
  scenarios: z.array(z.string()),
  isFeatured: z.boolean().optional(),
  isHot: z.boolean().optional(),
  favoriteCount: z.number(),
  useCount: z.number(),
  createdAt: z.string(),
  locale: z.string().default('zh'),
});
export type PublicTemplate = z.infer<typeof publicTemplateSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
