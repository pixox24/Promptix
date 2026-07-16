import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRedisConnection,
  providerAdapterSchema,
  providerAdapterCapabilityError,
  providerModelInputSchema,
  publishableTemplateSchema,
  templateDraftSchema,
} from '../dist/index.js';

test('parses Redis database numbers and encoded credentials consistently', () => {
  assert.deepEqual(
    parseRedisConnection('rediss://worker:p%40ss@redis.example.com:6380/15'),
    {
      host: 'redis.example.com',
      port: 6380,
      username: 'worker',
      password: 'p@ss',
      db: 15,
      tls: {},
    },
  );
  assert.equal(parseRedisConnection('redis://localhost:6379').db, undefined);
  assert.throws(
    () => parseRedisConnection('redis://localhost/not-a-database'),
    /database number/,
  );
});

const draft = {
  name: '商品海报', summary: '电商主图模板', description: '用于快速生成商品主视觉', category: 'ecommerce',
  tags: ['电商'], scenarios: ['上新'],
  variables: [{ id: 'var-1', key: 'product', label: '商品', type: 'text', required: true }],
  promptTemplate: '为 {{product}} 生成高质感商品海报',
};

test('TemplateDraft accepts a valid modular prompt', () => {
  assert.equal(templateDraftSchema.safeParse(draft).success, true);
});

test('TemplateDraft rejects invalid variable keys', () => {
  const invalid = { ...draft, variables: [{ ...draft.variables[0], key: '中文 key' }] };
  assert.equal(templateDraftSchema.safeParse(invalid).success, false);
});

test('publishing requires a cover object key', () => {
  assert.equal(publishableTemplateSchema.safeParse(draft).success, false);
  assert.equal(publishableTemplateSchema.safeParse({ ...draft, coverObjectKey: 'public/templates/demo/cover.webp' }).success, true);
});

test('provider adapter list is closed and explicit', () => {
  assert.equal(providerAdapterSchema.safeParse('openai_compatible').success, true);
  assert.equal(providerAdapterSchema.safeParse('custom_65535_async').success, true);
  assert.equal(providerAdapterSchema.safeParse('runtime-npm-package').success, false);
});

test('default text model requires text and structured output', () => {
  const input = {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'DeepSeek V4 Pro',
    modelId: 'deepseek-v4-pro',
    capabilities: ['text'],
    defaults: {},
    enabled: true,
    isDefaultText: true,
    isDefaultVision: false,
    isDefaultImage: false,
  };
  assert.equal(providerModelInputSchema.safeParse(input).success, false);
  assert.equal(providerModelInputSchema.safeParse({
    ...input,
    capabilities: ['text', 'structured_output'],
  }).success, true);
});

test('vision and image defaults require matching capabilities', () => {
  const base = {
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Model',
    modelId: 'model-id',
    capabilities: ['text', 'structured_output'],
    defaults: {},
    enabled: true,
    isDefaultText: false,
    isDefaultVision: true,
    isDefaultImage: false,
  };
  assert.equal(providerModelInputSchema.safeParse(base).success, false);
  assert.equal(providerModelInputSchema.safeParse({
    ...base,
    capabilities: ['text', 'structured_output', 'vision'],
  }).success, true);
  assert.equal(providerModelInputSchema.safeParse({
    ...base,
    isDefaultVision: false,
    isDefaultImage: true,
  }).success, false);
});

test('a disabled model cannot hold a default role', () => {
  assert.equal(providerModelInputSchema.safeParse({
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Disabled default',
    modelId: 'disabled-default',
    capabilities: ['text', 'structured_output'],
    defaults: {},
    enabled: false,
    isDefaultText: true,
    isDefaultVision: false,
    isDefaultImage: false,
  }).success, false);
});

test('structured output capability requires text capability', () => {
  assert.equal(providerModelInputSchema.safeParse({
    providerId: '00000000-0000-4000-8000-000000000001',
    name: 'Invalid structured model',
    modelId: 'invalid-structured',
    capabilities: ['structured_output'],
    defaults: {},
    enabled: true,
    isDefaultText: false,
    isDefaultVision: false,
    isDefaultImage: false,
  }).success, false);
});

test('adapter and declared capabilities must be executable by the factory', () => {
  assert.match(
    providerAdapterCapabilityError('custom_65535_async', ['text', 'structured_output']),
    /only supports image/,
  );
  assert.equal(providerAdapterCapabilityError('custom_65535_async', ['image']), null);
  assert.match(providerAdapterCapabilityError('anthropic', ['image']), /image models/);
  assert.match(providerAdapterCapabilityError('deepseek', ['image']), /image models/);
  assert.equal(providerAdapterCapabilityError('openai', ['image']), null);
  assert.equal(providerAdapterCapabilityError('google', ['image']), null);
});
