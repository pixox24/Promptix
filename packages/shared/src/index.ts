import { z } from 'zod';

export const PROMPTIX_VERSION = '0.0.0' as const;

export function parseRedisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('Redis URL must use redis: or rediss:');
  }
  const databaseText = url.pathname.replace(/^\//, '');
  if (databaseText && !/^\d+$/.test(databaseText)) {
    throw new Error('Redis URL database number must be a non-negative integer');
  }
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(databaseText ? { db: Number(databaseText) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

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

export const providerAdapterSchema = z.enum([
  'openai_compatible',
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom_65535_async',
]);
export type ProviderAdapter = z.infer<typeof providerAdapterSchema>;

export const modelCapabilitySchema = z.enum([
  'text',
  'vision',
  'image',
  'structured_output',
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export function providerAdapterCapabilityError(
  adapterType: ProviderAdapter,
  capabilities: ModelCapability[],
) {
  const values = new Set(capabilities);
  if (adapterType === 'custom_65535_async') {
    if (!values.has('image') || [...values].some((value) => value !== 'image')) {
      return 'custom_65535_async only supports image capability';
    }
  }
  if ((adapterType === 'anthropic' || adapterType === 'deepseek') && values.has('image')) {
    return `${adapterType} adapter does not provide image models`;
  }
  return null;
}

const providerOptionsSchema = z.record(z.record(z.unknown()));

export const modelDefaultsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(131072).optional(),
  topP: z.number().min(0).max(1).optional(),
  providerOptions: providerOptionsSchema.optional(),
  image: z.object({
    size: z.string().regex(/^\d+x\d+$/).optional(),
    aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
    n: z.number().int().min(1).max(10).optional(),
    seed: z.number().int().nonnegative().optional(),
  }).optional(),
  async: z.object({
    pollIntervalMs: z.number().int().min(250).max(10000).optional(),
    timeoutMs: z.number().int().min(10000).max(3600000).optional(),
    maxQueueSeconds: z.number().int().min(1).max(3600).optional(),
    quality: z.string().min(1).optional(),
    responseFormat: z.string().min(1).optional(),
  }).optional(),
}).default({});
export type ModelDefaults = z.infer<typeof modelDefaultsSchema>;

export const providerModelInputSchema = z.object({
  providerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  modelId: z.string().trim().min(1).max(200),
  capabilities: z.array(modelCapabilitySchema).min(1),
  defaults: modelDefaultsSchema,
  enabled: z.boolean().default(true),
  isDefaultText: z.boolean().default(false),
  isDefaultVision: z.boolean().default(false),
  isDefaultImage: z.boolean().default(false),
}).superRefine((value, ctx) => {
  const capabilities = new Set(value.capabilities);
  if (!value.enabled &&
      (value.isDefaultText || value.isDefaultVision || value.isDefaultImage)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['enabled'],
      message: 'A disabled model cannot hold a default role',
    });
  }
  if (capabilities.has('structured_output') && !capabilities.has('text')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['capabilities'],
      message: 'structured_output capability requires text capability',
    });
  }
  if (value.isDefaultText &&
      (!capabilities.has('text') || !capabilities.has('structured_output'))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultText'],
      message: 'Default text model requires text and structured_output capabilities',
    });
  }
  if (value.isDefaultVision && !capabilities.has('vision')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultVision'],
      message: 'Default vision model requires vision capability',
    });
  }
  if (value.isDefaultImage && !capabilities.has('image')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isDefaultImage'],
      message: 'Default image model requires image capability',
    });
  }
});
export type ProviderModelInput = z.infer<typeof providerModelInputSchema>;

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
