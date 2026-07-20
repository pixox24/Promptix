import { createHash } from 'node:crypto';
import {
  promptVariableSchema,
  renderPromptTemplate,
  resolveTemplateAspectRatio,
} from '@promptix/shared';

type TemplateSnapshot = {
  id: string;
  promptTemplate: string;
  variables: unknown;
  negativePrompt?: string | null;
};

export type TemplateCoverSource = 'image_reverse_auto_cover' | 'template_revision_cover';

export type TemplateCoverRequest = {
  prompt: string;
  negativePrompt: string;
  aspectRatio?: string;
  metadata: {
    source: TemplateCoverSource;
    templateId: string;
    templateFingerprint: string;
    templatePromptTemplate: string;
    resolvedValues: Record<string, string>;
    warnings: string[];
  };
};

const COVER_SUFFIX = 'Create a representative cover image for this reusable image-generation template. Keep the main subject visually prominent with clear subject-background separation. Use a clean composition suitable for a template preview. Do not render template variables, placeholder syntax, UI labels, watermarks, or explanatory text in the image.';
const COVER_NEGATIVE = ['unresolved placeholders', 'UI labels', 'watermarks', 'explanatory text'];

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return typeof value === 'string' ? value.trim() : value;
}

export function templateCoverFingerprint(template: TemplateSnapshot) {
  const variables = promptVariableSchema.array().parse(template.variables).map(({ key, type, defaultValue, options, suggestions }) => ({ key, type, defaultValue, options, suggestions }));
  return createHash('sha256').update(JSON.stringify(stableValue({ promptTemplate: template.promptTemplate, variables, negativePrompt: template.negativePrompt ?? '' }))).digest('hex');
}

export function buildTemplateCoverRequest(template: TemplateSnapshot, source: TemplateCoverSource): TemplateCoverRequest {
  const variables = promptVariableSchema.array().parse(template.variables);
  const knownKeys = new Set(variables.map((variable) => variable.key));
  for (const match of template.promptTemplate.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g)) {
    if (!knownKeys.has(match[1])) throw new Error('TEMPLATE_UNKNOWN_VARIABLE');
  }
  const warnings: string[] = [];
  const resolvedValues = Object.fromEntries(variables.map((variable) => {
    const value = variable.defaultValue?.trim() || (variable.type === 'text' || variable.type === 'number' ? variable.suggestions?.[0] : variable.options?.[0]) || '';
    if (!value && variable.type !== 'image') warnings.push(`${variable.key} 没有默认值，封面将留空`);
    if (variable.type === 'image') warnings.push(`${variable.key} 为图片变量，未写入封面文本`);
    return [variable.key, value];
  }));
  const rendered = renderPromptTemplate({ variables, promptTemplate: template.promptTemplate }, resolvedValues);
  if (/\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/.test(rendered)) throw new Error('TEMPLATE_UNRESOLVED');
  const ratio = resolveTemplateAspectRatio(variables, resolvedValues)?.value;
  const negativePrompt = [...(template.negativePrompt ?? '').split(',').map((item) => item.trim()), ...COVER_NEGATIVE]
    .filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(', ');
  return {
    prompt: `${rendered}\n\n${COVER_SUFFIX}`,
    negativePrompt,
    ...(ratio ? { aspectRatio: ratio } : {}),
    metadata: {
      source,
      templateId: template.id,
      templateFingerprint: templateCoverFingerprint(template),
      templatePromptTemplate: template.promptTemplate,
      resolvedValues,
      warnings,
    },
  };
}
