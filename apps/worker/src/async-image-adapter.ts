import { normalizeModelDefaults, readProviderKey } from './model-defaults.js';
import { hasCapability, type ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

function endpoint(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path}`;
}

function authHeaders(config: ResolvedModel) {
  const key = readProviderKey(config.provider);
  return {
    'Content-Type': 'application/json',
    ...(key
      ? config.provider.authStyle === 'header'
        ? { 'X-API-Key': key }
        : { Authorization: `Bearer ${key}` }
      : {}),
  };
}

export async function generateAsyncImage(config: ResolvedModel, input: JsonRecord) {
  if (config.provider.adapterType !== 'custom_65535_async') {
    throw new Error('Asynchronous image adapter received a non-async provider');
  }
  if (!hasCapability(config.model, 'image')) {
    throw new Error(`Model ${config.model.name} lacks image capability`);
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt) throw new Error('input.prompt is required');
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const timeoutMs = Math.min(3600000, Math.max(10000, defaults.async.timeoutMs ?? 900000));
  const deadline = Date.now() + timeoutMs;
  const requestSignal = () => AbortSignal.timeout(Math.max(1, deadline - Date.now()));
  const headers: Record<string, string> = {
    ...authHeaders(config),
    'X-Async-Mode': 'true',
  };
  if (defaults.async.maxQueueSeconds !== undefined) {
    headers['X-Async-Image-Max-Queue-Sec'] = String(defaults.async.maxQueueSeconds);
  }
  const body = {
    model: config.model.modelId,
    prompt,
    size: typeof input.size === 'string'
      ? input.size
      : defaults.image.size ?? '1024x1024',
    n: typeof input.n === 'number' ? input.n : defaults.image.n ?? 1,
    ...(defaults.async.quality ? { quality: defaults.async.quality } : {}),
    ...(defaults.async.responseFormat
      ? { response_format: defaults.async.responseFormat }
      : {}),
  };
  const response = await fetch(endpoint(config.provider.baseUrl, '/images/generations'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: requestSignal(),
  });
  if (!response.ok) {
    throw new Error(`Image provider ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const accepted = await response.json() as {
    job_id?: string;
    status_url?: string;
    status?: string;
  };
  if (!accepted.job_id) throw new Error('Async image provider returned no job_id');
  const statusUrl = accepted.status_url
    ? new URL(accepted.status_url, config.provider.baseUrl).toString()
    : endpoint(config.provider.baseUrl, `/images/async-generations/${accepted.job_id}`);
  if (new URL(statusUrl).origin !== new URL(config.provider.baseUrl).origin) {
    throw new Error('Async image status URL must use the same origin as the provider');
  }
  const pollMs = Math.min(10000, Math.max(250, defaults.async.pollIntervalMs ?? 2000));
  while (Date.now() < deadline) {
    const polled = await fetch(statusUrl, {
      headers: authHeaders(config),
      signal: requestSignal(),
    });
    if (!polled.ok) {
      throw new Error(`Image job polling ${polled.status}: ${(await polled.text()).slice(0, 500)}`);
    }
    const envelope = await polled.json() as {
      code?: number;
      message?: string;
      data?: {
        status?: string;
        result_urls?: string[];
        error_code?: string;
        error_message?: string;
        expires_at?: string;
        cost_usd?: number;
        image_size_tier?: string;
      };
    };
    if (envelope.code !== undefined && envelope.code !== 0) {
      throw new Error(`Image provider job error: ${envelope.message ?? envelope.code}`);
    }
    const data = envelope.data;
    if (data?.status === 'done') {
      if (!data.result_urls?.length) {
        throw new Error('Image provider completed without result URLs');
      }
      return {
        images: data.result_urls.map((url) => ({ url })),
        providerJobId: accepted.job_id,
        expiresAt: data.expires_at,
        costUsd: data.cost_usd,
        sizeTier: data.image_size_tier,
      };
    }
    if (data?.status === 'failed') {
      throw new Error(`${data.error_code ?? 'image_failed'}: ${data.error_message ?? 'Image generation failed'}`);
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remainingMs)));
    }
  }
  throw new Error(`Image generation timed out after ${Math.round(timeoutMs / 1000)} seconds (provider job ${accepted.job_id} may still be running)`);
}
