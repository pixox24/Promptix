import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { ProviderAdapter } from '@promptix/shared';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readProviderKey(provider: { apiKeyEnv: string | null }) {
  if (!provider.apiKeyEnv) return undefined;
  const value = process.env[provider.apiKeyEnv];
  if (!value) throw new Error(`Provider key environment variable ${provider.apiKeyEnv} is not set`);
  return value;
}

export function normalizeModelDefaults(adapterType: ProviderAdapter, value: unknown) {
  const raw = record(value);
  const language: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    providerOptions?: ProviderOptions;
  } = {};
  const temperature = finiteNumber(raw.temperature);
  const maxOutputTokens = finiteNumber(raw.maxOutputTokens ?? raw.max_tokens);
  const topP = finiteNumber(raw.topP ?? raw.top_p);
  if (temperature !== undefined) language.temperature = temperature;
  if (maxOutputTokens !== undefined) language.maxOutputTokens = maxOutputTokens;
  if (topP !== undefined) language.topP = topP;

  const configuredOptions = record(raw.providerOptions);
  const providerOptions: JsonRecord = { ...configuredOptions };
  if (adapterType === 'deepseek' && raw.thinking !== undefined) {
    providerOptions.deepseek = {
      ...record(providerOptions.deepseek),
      thinking: raw.thinking,
    };
  }
  if (Object.keys(providerOptions).length) {
    language.providerOptions = providerOptions as ProviderOptions;
  }

  const imageRaw = record(raw.image);
  const size = typeof imageRaw.size === 'string'
    ? imageRaw.size
    : typeof raw.size === 'string' ? raw.size : undefined;
  const aspectRatio = typeof imageRaw.aspectRatio === 'string'
    ? imageRaw.aspectRatio
    : undefined;
  const n = finiteNumber(imageRaw.n ?? raw.n);
  const seed = finiteNumber(imageRaw.seed ?? raw.seed);
  const image = {
    ...(size ? { size } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(n !== undefined ? { n } : {}),
    ...(seed !== undefined ? { seed } : {}),
  };

  const asyncRaw = record(raw.async);
  const pollIntervalMs = finiteNumber(asyncRaw.pollIntervalMs ?? raw.asyncPollIntervalMs);
  const timeoutMs = finiteNumber(asyncRaw.timeoutMs ?? raw.asyncTimeoutMs);
  const maxQueueSeconds = finiteNumber(asyncRaw.maxQueueSeconds ?? raw.maxQueueSeconds);
  const quality = typeof asyncRaw.quality === 'string'
    ? asyncRaw.quality
    : typeof raw.quality === 'string' ? raw.quality : undefined;
  const responseFormat = typeof asyncRaw.responseFormat === 'string'
    ? asyncRaw.responseFormat
    : typeof raw.response_format === 'string' ? raw.response_format : undefined;
  const async = {
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxQueueSeconds !== undefined ? { maxQueueSeconds } : {}),
    ...(quality ? { quality } : {}),
    ...(responseFormat ? { responseFormat } : {}),
  };

  return { language, image, async };
}
