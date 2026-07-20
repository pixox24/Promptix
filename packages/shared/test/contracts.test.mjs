import test from 'node:test';
import assert from 'node:assert/strict';
import {
  jobTypeSchema,
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestFlowTypeSchema,
  ingestErrorDetailsSchema,
  ingestProgressSchema,
  ingestSystemPromptSchema,
  defaultPromptValues,
  parseAspectRatio,
  parsePromptTemplateSegments,
  parseRedisConnection,
  providerAdapterSchema,
  providerAdapterCapabilityError,
  providerModelInputSchema,
  providerTextTestResultSchema,
  publicGenerationCreateSchema,
  publishableTemplateSchema,
  renderPromptTemplate,
  templateDraftSchema,
  validatePromptValues,
} from '../dist/index.js';

test('renders and segments arbitrary modular prompt variables', () => {
  const template = {
    variables: [
      { id: 'v1', key: 'subject', label: '主体', type: 'text', required: true },
      { id: 'v2', key: 'ratio', label: '比例', type: 'ratio', options: ['1:1', '16:9'], defaultValue: '1:1' },
    ],
    promptTemplate: 'Portrait of {{subject}}, ratio {{ratio}}, keep {{unknown}}',
  };
  assert.deepEqual(defaultPromptValues(template.variables), { subject: '', ratio: '1:1' });
  assert.equal(renderPromptTemplate(template, { subject: 'Ada', ratio: '16:9' }), 'Portrait of Ada, ratio 16:9, keep');
  assert.deepEqual(parsePromptTemplateSegments(template), [
    { type: 'text', value: 'Portrait of ' },
    { type: 'variable', key: 'subject' },
    { type: 'text', value: ', ratio ' },
    { type: 'variable', key: 'ratio' },
    { type: 'text', value: ', keep ' },
    { type: 'text', value: '{{unknown}}' },
  ]);
});

test('validates required, closed options, and unknown values', () => {
  const variables = [
    { id: 'v1', key: 'subject', label: '主体', type: 'text', required: true },
    { id: 'v2', key: 'ratio', label: '比例', type: 'ratio', options: ['1:1'] },
  ];
  assert.deepEqual(validatePromptValues(variables, { subject: '', ratio: '16:9', extra: 'x' }).map((issue) => issue.code).sort(), [
    'invalid_option', 'required', 'unknown_variable',
  ]);
});

test('suggestions assist free input without becoming strict options', () => {
  const variables = [{ id: 'v1', key: 'subject', label: '主体', type: 'text', suggestions: ['年轻女性', '商务男性'] }];
  assert.equal(templateDraftSchema.safeParse({ ...draft, variables, promptTemplate: '{{subject}}' }).success, true);
  assert.deepEqual(validatePromptValues(variables, { subject: '完全自定义的主体' }), []);
});

test('variable value lists are normalized and reject invalid suggestion contracts', () => {
  const valid = templateDraftSchema.parse({
    ...draft,
    variables: [{ ...draft.variables[0], suggestions: ['  商品礼盒  ', '运动鞋', '护肤品', '智能手表'] }],
  });
  assert.deepEqual(valid.variables[0].suggestions, ['商品礼盒', '运动鞋', '护肤品', '智能手表']);
  assert.equal(templateDraftSchema.safeParse({ ...draft, variables: [{ ...draft.variables[0], suggestions: ['重复', '重复'] }] }).success, false);
  assert.equal(templateDraftSchema.safeParse({ ...draft, variables: [{ ...draft.variables[0], suggestions: Array.from({ length: 9 }, (_, index) => String(index)) }] }).success, false);
  assert.equal(templateDraftSchema.safeParse({ ...draft, variables: [{ ...draft.variables[0], type: 'image', suggestions: ['图片'] }] }).success, false);
});

test('normalizes aspect ratios and public generation requests', () => {
  assert.deepEqual(parseAspectRatio('16:9'), { value: '16:9', width: 16, height: 9, ratio: 16 / 9 });
  assert.equal(parseAspectRatio('保持原比例'), null);
  assert.equal(publicGenerationCreateSchema.safeParse({
    templateId: 'tpl-one', values: { subject: 'Ada' }, clientRequestId: '00000000-0000-4000-8000-000000000001',
  }).success, true);
  assert.equal(publicGenerationCreateSchema.safeParse({
    templateId: 'tpl-one', values: {}, clientRequestId: 'not-a-uuid',
  }).success, false);
});

test('ingest prompts are flow-specific and bounded', () => {
  assert.deepEqual(ingestFlowTypeSchema.options, ['text_expand', 'image_reverse']);
  assert.notEqual(DEFAULT_INGEST_SYSTEM_PROMPTS.text_expand, DEFAULT_INGEST_SYSTEM_PROMPTS.image_reverse);
  assert.equal(ingestSystemPromptSchema.parse('  system instruction  '), 'system instruction');
  assert.equal(ingestSystemPromptSchema.safeParse('   ').success, false);
  assert.equal(ingestSystemPromptSchema.safeParse('x'.repeat(20_001)).success, false);
  for (const prompt of Object.values(DEFAULT_INGEST_SYSTEM_PROMPTS)) {
    assert.match(prompt, /text 变量必须生成 4-6 个 suggestions/);
    assert.match(prompt, /select 变量生成 4-8 个严格 options/);
    assert.match(prompt, /image 变量不得生成 options 或 suggestions/);
  }
});

test('ingest pipeline contracts bound progress and safe diagnostics', () => {
  assert.equal(ingestProgressSchema.safeParse({ stage: 'vision', percent: 15, message: '正在理解图片', updatedAt: new Date().toISOString() }).success, true);
  assert.equal(ingestProgressSchema.safeParse({ stage: 'unknown', percent: 101, message: '', updatedAt: 'now' }).success, false);
  assert.equal(ingestErrorDetailsSchema.safeParse({ code: 'STRUCTURE_JSON_INVALID', stage: 'structure', retryable: false, outputPreviewStart: 'x'.repeat(501) }).success, false);
});

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
  name: '商品海报', summary: '电商主图模板', description: '用于快速生成商品主视觉',
  semantic: {
    workflowType: 'generate', outputType: 'product_image',
    tags: ['电商'], scenarios: ['ecommerce_product'], styles: ['commercial_illustration'], subjects: ['product'],
    unmappedTerms: [], confidence: { outputType: 0.96 },
  },
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

test('TemplateDraft rejects duplicate taxonomy values and invalid confidence', () => {
  assert.equal(templateDraftSchema.safeParse({
    ...draft,
    semantic: { ...draft.semantic, styles: ['cinematic', 'cinematic'] },
  }).success, false);
  assert.equal(templateDraftSchema.safeParse({
    ...draft,
    semantic: { ...draft.semantic, confidence: { outputType: 1.1 } },
  }).success, false);
});

test('TemplateDraft keeps unknown taxonomy concepts out of canonical fields', () => {
  assert.equal(templateDraftSchema.safeParse({
    ...draft,
    semantic: {
      ...draft.semantic,
      outputType: null,
      unmappedTerms: [{ dimension: 'output_type', label: '全息橱窗', reason: '词库中没有匹配项', confidence: 0.82 }],
    },
  }).success, true);
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

test('provider test is a bounded text-only job type', () => {
  assert.equal(jobTypeSchema.safeParse('provider_test').success, true);
  assert.equal(providerTextTestResultSchema.safeParse({
    ok: true,
    providerId: '00000000-0000-4000-8000-000000000001',
    modelId: '00000000-0000-4000-8000-000000000002',
    latencyMs: 23,
    checkedAt: '2026-07-17T00:00:00.000Z',
  }).success, true);
  assert.equal(providerTextTestResultSchema.safeParse({ ok: true }).success, false);
});
