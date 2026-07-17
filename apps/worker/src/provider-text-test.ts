import {
  providerTextTestResultSchema,
  type ProviderTextTestResult,
} from '@promptix/shared';
import { generateText } from 'ai';
import { createLanguageModel } from './model-factory.js';
import type { ResolvedModel } from './model-types.js';

export const PROVIDER_TEST_PROMPT = 'Reply with OK only';

export class ProviderTextTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTextTestError';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function statusCode(error: unknown, message: string) {
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { status?: unknown; statusCode?: unknown }).statusCode
      ?? (error as { status?: unknown }).status;
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isInteger(parsed)) return parsed;
    }
  }
  const match = message.match(/\b(401|403|404|429)\b/);
  return match ? Number(match[1]) : undefined;
}

function redactCredentials(message: string) {
  return message
    .replace(
      /(\b(?:(?:authorization\s*(?::|=)\s*)?bearer)\s+)([^\s,;'"`}\]]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(\bx-api-key(?:\s*(?::|=)\s*|\s+))([^\s,;'"`}\]]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      /((?:["'](?:api_key|apiKey)["']|(?:api_key|apiKey))\s*(?::|=)\s*)(?:"[^"]*"|'[^']*'|[^\s,}\]]+)/gi,
      '$1[REDACTED]',
    );
}

function isTimeoutOrNetworkError(error: unknown, message: string) {
  const name = error instanceof Error ? error.name : '';
  return /(?:abort(?:ed)?|timed?\s*out|timeout|etimedout|econnrefused|econnreset|enotfound|eai_again|network(?:\s+error)?|fetch failed|socket hang up|could not reach)/i
    .test(`${name} ${message}`);
}

function normalizeProviderTextTestError(error: unknown) {
  const message = errorMessage(error);
  switch (statusCode(error, message)) {
    case 401:
    case 403:
      return 'Provider authentication failed';
    case 404:
      return 'Provider endpoint or model was not found';
    case 429:
      return 'Provider rate limit reached';
  }
  if (isTimeoutOrNetworkError(error, message)) {
    return 'Provider request timed out or could not reach the endpoint';
  }
  return `Provider test failed: ${redactCredentials(message).slice(0, 240)}`;
}

export async function runProviderTextTest(
  config: ResolvedModel,
  invoke: typeof generateText = generateText,
): Promise<ProviderTextTestResult> {
  const startedAt = performance.now();
  try {
    await invoke({
      model: createLanguageModel(config),
      prompt: PROVIDER_TEST_PROMPT,
      temperature: 0,
      maxOutputTokens: 16,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return providerTextTestResultSchema.parse({
      ok: true,
      providerId: config.provider.id,
      modelId: config.model.id,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new ProviderTextTestError(normalizeProviderTextTestError(error));
  }
}
