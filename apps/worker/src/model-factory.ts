import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ImageModel, LanguageModel } from 'ai';
import { readProviderKey } from './model-defaults.js';
import type { ResolvedModel } from './model-types.js';

function openAICompatibleProvider(config: ResolvedModel) {
  const apiKey = readProviderKey(config.provider);
  if (config.provider.authStyle === 'header' && apiKey) {
    return createOpenAICompatible({
      name: 'promptix',
      baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      headers: { 'X-API-Key': apiKey },
    });
  }
  return createOpenAICompatible({
    name: 'promptix',
    baseURL: config.provider.baseUrl.replace(/\/$/, ''),
    apiKey,
  });
}

export function createLanguageModel(config: ResolvedModel): LanguageModel {
  const apiKey = readProviderKey(config.provider);
  switch (config.provider.adapterType) {
    case 'openai_compatible':
      return openAICompatibleProvider(config).chatModel(config.model.modelId);
    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'anthropic':
      return createAnthropic({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'google':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'deepseek':
      return createDeepSeek({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      })(config.model.modelId);
    case 'custom_65535_async':
      throw new Error('custom_65535_async does not provide language models');
  }
}

export function createImageModel(config: ResolvedModel): ImageModel {
  const apiKey = readProviderKey(config.provider);
  switch (config.provider.adapterType) {
    case 'openai_compatible':
      return openAICompatibleProvider(config).imageModel(config.model.modelId);
    case 'openai':
      return createOpenAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      }).image(config.model.modelId);
    case 'google':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: config.provider.baseUrl.replace(/\/$/, ''),
      }).image(config.model.modelId);
    case 'anthropic':
      throw new Error('anthropic does not provide image models');
    case 'deepseek':
      throw new Error('deepseek does not provide image models');
    case 'custom_65535_async':
      throw new Error('custom_65535_async is handled by the asynchronous adapter');
  }
}
