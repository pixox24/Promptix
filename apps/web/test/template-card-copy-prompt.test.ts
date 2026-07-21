import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildTemplateCardPrompt } from '../src/lib/templateCardPrompt';
import type { PromptTemplate } from '../src/types/prompt';

function template(variables: PromptTemplate['variables'], promptTemplate: string): PromptTemplate {
  return {
    id: 'template-card-copy',
    name: 'Card Copy',
    summary: '',
    description: '',
    coverImage: '/cover.jpg',
    category: 'illustration',
    tags: [],
    variables,
    promptTemplate,
    scenarios: [],
    favoriteCount: 0,
    useCount: 0,
    createdAt: '2026-07-21T00:00:00.000Z',
  };
}

test('builds a directly usable prompt using the approved fallback order', () => {
  const result = buildTemplateCardPrompt(template([
    { id: '1', key: 'subject', label: '主体', type: 'text', required: true, defaultValue: '雪山', suggestions: ['森林'], options: ['城市'] },
    { id: '2', key: 'style', label: '风格', type: 'text', required: true, suggestions: ['电影感'] },
    { id: '3', key: 'ratio', label: '比例', type: 'ratio', required: true, options: ['16:9'] },
    { id: '4', key: 'mood', label: '氛围', type: 'text' },
  ], '{{subject}}, {{style}}, {{ratio}}, {{mood}}'));

  assert.deepEqual(result, { ok: true, prompt: '雪山, 电影感, 16:9' });
});

test('blocks card copying when a required variable has no usable fallback', () => {
  const result = buildTemplateCardPrompt(template([
    { id: '1', key: 'subject', label: '主体', type: 'text', required: true },
  ], 'Create {{subject}}'));

  assert.deepEqual(result, { ok: false, missingLabels: ['主体'] });
});

test('card replaces its date pill with an isolated copy action while keeping createdAt data', async () => {
  const [cardSource, typeSource] = await Promise.all([
    readFile(new URL('../src/components/template/TemplateCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/types/prompt.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(cardSource, /formatDate/);
  assert.doesNotMatch(cardSource, /template\.createdAt/);
  assert.match(typeSource, /createdAt: string/);
  assert.match(cardSource, /navigator\.clipboard\.writeText/);
  assert.match(cardSource, /preventDefault\(\)/);
  assert.match(cardSource, /stopPropagation\(\)/);
  assert.match(cardSource, /IconCopy/);
  assert.match(cardSource, /提示词已复制/);
  assert.match(cardSource, /复制失败，请进入详情页手动复制/);
  assert.match(cardSource, /该模板需要补充变量，请进入详情页/);
});
