import test from 'node:test';
import assert from 'node:assert/strict';
import { describeImage, structurePrompt } from '../dist/adapters.js';

const draft = {
  name: '优化模板', summary: '优化后的提示词', description: '结构化描述', category: 'illustration',
  tags: ['插画'], scenarios: ['创作'], variables: [{ id: 'var-1', key: 'subject', label: '主体', type: 'text' }],
  promptTemplate: '为 {{subject}} 创作一张精致插画',
};

test('DeepSeek provider sends text-only JSON mode requests and strips capability metadata', async () => {
  process.env.TEST_DEEPSEEK_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-v4-flash');
    assert.equal(typeof body.messages[1].content, 'string');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.equal('supportsVision' in body, false);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }), { status: 200 });
  };
  try {
    const result = await structurePrompt({ protocol: 'deepseek_chat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'TEST_DEEPSEEK_API_KEY', defaultModel: 'deepseek-v4-flash', defaults: { supportsVision: false, thinking: { type: 'disabled' }, max_tokens: 4096 }, authStyle: 'bearer' }, { text: '把猫咪插画提示词优化一下' });
    assert.equal(result.name, '优化模板');
  } finally { globalThis.fetch = originalFetch; }
});

test('DeepSeek provider rejects direct image input with an actionable error', async () => {
  await assert.rejects(
    () => structurePrompt({ protocol: 'deepseek_chat', baseUrl: 'https://api.deepseek.com', apiKeyEnv: null, defaultModel: 'deepseek-v4-flash', defaults: {}, authStyle: 'bearer' }, { imageUrl: 'data:image/png;base64,AA==' }),
    /does not accept image input/,
  );
});

test('vision provider produces a description for the DeepSeek second stage', async () => {
  process.env.TEST_VISION_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(Array.isArray(body.messages[1].content), true);
    assert.equal(body.messages[1].content[1].type, 'image_url');
    return new Response(JSON.stringify({ choices: [{ message: { content: '蓝色背景中的白猫，柔和侧光，居中构图。' } }] }), { status: 200 });
  };
  try {
    const result = await describeImage({ protocol: 'openai_chat', baseUrl: 'https://vision.example/v1', apiKeyEnv: 'TEST_VISION_API_KEY', defaultModel: 'vision-model', defaults: { supportsVision: true }, authStyle: 'bearer' }, 'data:image/png;base64,AA==');
    assert.match(result, /白猫/);
  } finally { globalThis.fetch = originalFetch; }
});
