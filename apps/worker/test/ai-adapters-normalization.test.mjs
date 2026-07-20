import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDraft } from '../dist/ai-adapters.js';

function draft(variables) {
  return {
    name: '参考图模板',
    summary: '用于验证结构化输出归一化',
    description: '模型可能为不支持推荐值的变量返回 suggestions。',
    semantic: { workflowType: 'generate', outputType: 'illustration', tags: [], scenarios: [], styles: [], subjects: [], unmappedTerms: [], confidence: {} },
    variables,
    promptTemplate: variables.map((variable) => `{{${variable.key}}}`).join(', '),
  };
}

test('removes suggestions from variable types that do not support them', () => {
  const variables = ['select', 'ratio', 'image', 'select', 'ratio'].map((type, index) => ({
    key: `field_${index}`,
    label: `字段 ${index}`,
    type,
    ...(type === 'image' ? {} : { options: type === 'ratio' ? ['1:1', '16:9'] : ['选项一', '选项二'] }),
    suggestions: ['不应保留'],
  }));

  const normalized = normalizeDraft(draft(variables)).draft;

  assert.deepEqual(normalized.variables.map((variable) => variable.suggestions), [undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual(normalized.variables.map((variable) => variable.id), ['var-1', 'var-2', 'var-3', 'var-4', 'var-5']);
});

test('keeps free-input suggestions and removes non-strict options', () => {
  const normalized = normalizeDraft(draft([
    { key: 'subject', label: '主体', type: 'text', options: ['旧选项'], suggestions: ['人物', '产品'] },
    { key: 'count', label: '数量', type: 'number', options: ['1', '2'], suggestions: ['1', '2'] },
  ])).draft;

  assert.deepEqual(normalized.variables[0].suggestions, ['人物', '产品']);
  assert.deepEqual(normalized.variables[1].suggestions, ['1', '2']);
  assert.equal(normalized.variables[0].options, undefined);
  assert.equal(normalized.variables[1].options, undefined);
});

test('maps labels and aliases to canonical taxonomy slugs and captures unknown terms', () => {
  const input = draft([{ key: 'subject', label: '主体', type: 'text' }]);
  input.semantic = { ...input.semantic, outputType: '壁纸', styles: ['真实摄影', '未知风格'], subjects: ['自然·风景'] };
  const snapshot = { version: 1, terms: [
    { dimension: 'output_type', slug: 'wallpaper', label: '壁纸', aliases: [] },
    { dimension: 'style', slug: 'photorealistic', label: '写实摄影', aliases: ['真实摄影'] },
    { dimension: 'subject', slug: 'nature_landscape', label: '自然·风景', aliases: [] },
  ] };
  const normalized = normalizeDraft(input, snapshot);
  assert.equal(normalized.draft.semantic.outputType, 'wallpaper');
  assert.deepEqual(normalized.draft.semantic.styles, ['photorealistic']);
  assert.deepEqual(normalized.draft.semantic.subjects, ['nature_landscape']);
  assert.equal(normalized.draft.semantic.unmappedTerms.some((term) => term.label === '未知风格'), true);
});
