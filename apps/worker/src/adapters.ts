import { generateAsyncImage } from './async-image-adapter.js';
import {
  describeImage,
  generateStandardImage,
  structurePrompt,
} from './ai-adapters.js';
import type { ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

export { describeImage, structurePrompt };

export async function generateImage(config: ResolvedModel, input: JsonRecord) {
  return config.provider.adapterType === 'custom_65535_async'
    ? generateAsyncImage(config, input)
    : generateStandardImage(config, input);
}
