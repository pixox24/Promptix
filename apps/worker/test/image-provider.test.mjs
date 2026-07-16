import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage } from '../dist/adapters.js';

const provider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test Image Provider',
  adapterType: 'openai_compatible',
  baseUrl: 'https://img-cn.65535.space/v1',
  apiKeyEnv: 'TEST_IMAGE_API_KEY',
  authStyle: 'bearer',
  enabled: true,
  protocol: 'openai_images',
  kind: 'image',
  defaultModel: 'gpt-image-2',
  defaults: {},
  isDefault: false,
};

const model = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: provider.id,
  name: 'gpt-image-2',
  modelId: 'gpt-image-2',
  capabilities: ['image'],
  defaults: { image: { size: '1024x1024', n: 1 } },
  enabled: true,
  isDefaultText: false,
  isDefaultVision: false,
  isDefaultImage: true,
};

test('OpenAI-compatible image provider uses the standard synchronous response', async () => {
  process.env.TEST_IMAGE_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://img-cn.65535.space/v1/images/generations');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-image-2');
    assert.equal(body.size, '1024x1024');
    return new Response(JSON.stringify({
      created: 1,
      data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await generateImage({ provider, model }, { prompt: 'a red apple' });
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].b64_json, Buffer.from('png-bytes').toString('base64'));
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
    const result = await generateImage({
      provider: { ...provider, adapterType: 'custom_65535_async', protocol: 'openai_images_async' },
      model: { ...model, defaults: {
        image: { size: '2048x2048' },
        async: { quality: 'high', pollIntervalMs: 250, timeoutMs: 10000, maxQueueSeconds: 120 },
      } },
    }, { prompt: 'a neon city' });
    assert.equal(result.images[0].url, 'https://image.65535.space/result.png');
    assert.equal(result.providerJobId, 'img_test');
    assert.equal(result.costUsd, 0.18);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
