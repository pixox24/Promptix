import test from 'node:test';
import assert from 'node:assert/strict';
import { publishableTemplateSchema, templateDraftSchema } from '../dist/index.js';

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
