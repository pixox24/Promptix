import {
  promptVariableSchema,
  templateDraftSchema,
  type TemplateDraft,
} from '@promptix/shared';
import { generateImage as aiGenerateImage, generateText, Output } from 'ai';
import { z } from 'zod';
import { createImageModel, createLanguageModel } from './model-factory.js';
import { normalizeModelDefaults } from './model-defaults.js';
import { hasCapability, type ResolvedModel } from './model-types.js';

type JsonRecord = Record<string, unknown>;

const SYSTEM = `你是 Promptix 模板结构化引擎。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate；category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅 text/select/number/ratio/image；promptTemplate 必须包含全部变量的 {{key}} 占位符。`;

const generatedVariableSchema = promptVariableSchema.extend({
  id: promptVariableSchema.shape.id.optional(),
});

const generatedDraftSchema = templateDraftSchema.extend({
  variables: generatedVariableSchema.array().min(1).max(12),
});

async function inlineImage(imageUrl: string) {
  if (imageUrl.startsWith('data:')) return imageUrl;
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Unable to read source image (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Source image exceeds 10MB');
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function normalizeDraft(output: z.infer<typeof generatedDraftSchema>): TemplateDraft {
  return templateDraftSchema.parse({
    ...output,
    variables: output.variables.map((variable, index) => ({
      ...variable,
      id: variable.id || `var-${index + 1}`,
    })),
  });
}

export async function structurePrompt(
  config: ResolvedModel,
  input: JsonRecord,
): Promise<TemplateDraft> {
  if (!hasCapability(config.model, 'text') ||
      !hasCapability(config.model, 'structured_output')) {
    throw new Error(`Model ${config.model.name} lacks text or structured_output capability`);
  }
  const imageUrl = typeof input.imageUrl === 'string' ? input.imageUrl : undefined;
  const text = typeof input.text === 'string' ? input.text : '';
  if (imageUrl && !hasCapability(config.model, 'vision')) {
    throw new Error(`Model ${config.model.name} does not accept image input`);
  }
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const common = {
    model: createLanguageModel(config),
    system: SYSTEM,
    output: Output.object({ schema: generatedDraftSchema }),
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(120000),
    ...defaults.language,
  };
  const result = imageUrl
    ? await generateText({
        ...common,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '请从参考图反推一个可复用的中文 AI 绘图提示词模板。' },
            { type: 'image', image: await inlineImage(imageUrl) },
          ],
        }],
      })
    : await generateText({
        ...common,
        prompt: `请优化并结构化以下需求，输出可复用的中文 AI 绘图提示词模板：\n${text}`,
      });
  return normalizeDraft(result.output);
}

export async function describeImage(config: ResolvedModel, imageUrl: string) {
  if (!hasCapability(config.model, 'vision')) {
    throw new Error(`Model ${config.model.name} lacks vision capability`);
  }
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const result = await generateText({
    model: createLanguageModel(config),
    system: '你是专业视觉分析师。详细描述图片的主体、构图、镜头、光线、材质、色彩、风格、文字和空间关系，供另一个模型重建绘图提示词。不要省略细节。',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '请完整分析这张参考图。' },
        { type: 'image', image: await inlineImage(imageUrl) },
      ],
    }],
    maxRetries: 2,
    abortSignal: AbortSignal.timeout(120000),
    ...defaults.language,
  });
  if (!result.text.trim()) throw new Error('Vision provider returned no image description');
  return result.text;
}

export async function generateStandardImage(config: ResolvedModel, input: JsonRecord) {
  if (!hasCapability(config.model, 'image')) {
    throw new Error(`Model ${config.model.name} lacks image capability`);
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt) throw new Error('input.prompt is required');
  const defaults = normalizeModelDefaults(config.provider.adapterType, config.model.defaults);
  const size = typeof input.size === 'string' ? input.size : defaults.image.size;
  const n = typeof input.n === 'number' ? input.n : defaults.image.n;
  const result = await aiGenerateImage({
    model: createImageModel(config),
    prompt,
    ...(size ? { size: size as `${number}x${number}` } : {}),
    ...(defaults.image.aspectRatio
      ? { aspectRatio: defaults.image.aspectRatio as `${number}:${number}` }
      : {}),
    ...(n !== undefined ? { n } : {}),
    ...(defaults.image.seed !== undefined ? { seed: defaults.image.seed } : {}),
    ...(defaults.language.providerOptions
      ? { providerOptions: defaults.language.providerOptions }
      : {}),
    abortSignal: AbortSignal.timeout(300000),
  });
  return {
    images: result.images.map((image) => ({ b64_json: image.base64 })),
  };
}
