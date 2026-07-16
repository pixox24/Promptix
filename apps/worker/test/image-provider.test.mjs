import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage } from '../dist/adapters.js';

const baseProvider = {
  baseUrl: 'https://img-cn.65535.space/v1',
  apiKeyEnv: 'TEST_IMAGE_API_KEY',
  defaultModel: 'gpt-image-2',
  authStyle: 'bearer',
};

test('OpenAI-compatible image provider uses the standard synchronous response', async () => {
  process.env.TEST_IMAGE_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://img-cn.65535.space/v1/images/generations');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-image-2');
    assert.equal(body.size, '1024x1024');
    return new Response(JSON.stringify({ data: [{ url: 'https://image.example/result.png' }] }), { status: 200 });
  };
  try {
    const result = await generateImage({ ...baseProvider, protocol: 'openai_images', defaults: {} }, { prompt: 'a red apple' });
    assert.equal(result.images[0].url, 'https://image.example/result.png');
  } finally { globalThis.fetch = originalFetch; }
});

test('65535 async protocol submits then polls until done', async () => {
  process.env.TEST_IMAGE_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    if (calls === 1) {
      assert.equal(url, 'https://img-cn.65535.space/v1/images/generations');
      assert.equal(init.headers['X-Async-Mode'], 'true');
      assert.equal(init.headers['X-Async-Image-Max-Queue-Sec'], '120');
      return new Response(JSON.stringify({ job_id: 'img_test', status: 'pending', status_url: '/v1/images/async-generations/img_test' }), { status: 202 });
    }
    assert.equal(url, 'https://img-cn.65535.space/v1/images/async-generations/img_test');
    return new Response(JSON.stringify({ code: 0, message: 'success', data: { status: 'done', result_urls: ['https://image.65535.space/result.png'], expires_at: '2026-07-17T00:00:00Z', cost_usd: 0.18, image_size_tier: '2K' } }), { status: 200 });
  };
  try {
    const result = await generateImage({ ...baseProvider, protocol: 'openai_images_async', defaults: { size: '2048x2048', quality: 'high', maxQueueSeconds: 120 } }, { prompt: 'a neon city' });
    assert.equal(result.images[0].url, 'https://image.65535.space/result.png');
    assert.equal(result.providerJobId, 'img_test');
    assert.equal(result.costUsd, 0.18);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
