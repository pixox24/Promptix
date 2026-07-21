import { renderPromptTemplate } from '@promptix/shared';
import type { PromptTemplate } from '../types/prompt';

export type TemplateCardPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; missingLabels: string[] };

function firstNonEmpty(values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? '';
}

export function buildTemplateCardPrompt(template: PromptTemplate): TemplateCardPromptResult {
  const values = Object.fromEntries(template.variables.map((variable) => [
    variable.key,
    firstNonEmpty([
      variable.defaultValue,
      variable.suggestions?.[0],
      variable.options?.[0],
    ]),
  ]));
  const missingLabels = template.variables
    .filter((variable) => variable.required && !values[variable.key])
    .map((variable) => variable.label);

  if (missingLabels.length > 0) return { ok: false, missingLabels };
  return { ok: true, prompt: renderPromptTemplate(template, values) };
}
