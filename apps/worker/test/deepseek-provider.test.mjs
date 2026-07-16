import test from 'node:test';
import assert from 'node:assert/strict';
import { describeImage, structurePrompt } from '../dist/ai-adapters.js';

const draft = {
  name: '优化模板',
  summary: '优化后的提示词',
  description: '结构化描述',
  category: 'illustration',
  tags: ['插画'],
  scenarios: ['创作'],
  variables: [{ key: 'subject', label: '主体', type: 'text' }],
  promptTemplate: '为 {{subject}} 创作一张精致插画',
};

const provider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'DeepSeek',
  adapterType: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'TEST_DEEPSEEK_API_KEY',
  authStyle: 'bearer',
  enabled: true,
  protocol: 'deepseek_chat',
  kind: 'llm',
  defaultModel: 'deepseek-v4-pro',
  defaults: {},
  isDefault: true,
};

const model = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: provider.id,
  name: 'DeepSeek V4 Pro',
  modelId: 'deepseek-v4-pro',
  capabilities: ['text', 'structured_output'],
  defaults: {
    maxOutputTokens: 4096,
    providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
  },
  enabled: true,
  isDefaultText: true,
  isDefaultVision: false,
  isDefaultImage: false,
};

test('AI SDK produces and normalizes a TemplateDraft', async () => {
  process.env.TEST_DEEPSEEK_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.equal(body.thinking.type, 'disabled');
    return new Response(JSON.stringify({
      id: 'chat-test',
      object: 'chat.completion',
      created: 1,
      model: 'deepseek-v4-pro',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(draft) },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await structurePrompt({ provider, model }, { text: '优化猫咪插画' });
    assert.equal(result.name, '优化模板');
    assert.equal(result.variables[0].id, 'var-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('vision model sends an AI SDK file part without deprecated image warnings', async () => {
  process.env.TEST_DEEPSEEK_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const content = body.messages[1].content;
    assert.equal(Array.isArray(content), true);
    assert.equal(content.some((part) => part.type === 'image_url'), true);
    return new Response(JSON.stringify({
      id: 'chat-vision',
      object: 'chat.completion',
      created: 1,
      model: 'vision-model',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: '蓝色背景中的白猫，柔和侧光。' },
      }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await describeImage({
      provider: { ...provider, adapterType: 'openai_compatible' },
      model: { ...model, modelId: 'vision-model', capabilities: ['text', 'vision'] },
    }, 'data:image/png;base64,AA==');
    assert.match(result, /白猫/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
