import type { PromptTemplate, PromptVariable } from '../types/prompt';
import {
  defaultPromptValues,
  renderPromptTemplate,
  validatePromptValues,
} from '@promptix/shared';

/** 根据模板与变量值生成完整 Prompt */
export function buildPrompt(
  template: PromptTemplate,
  values: Record<string, string>,
): string {
  return renderPromptTemplate(template, values);
}

/** 从模板生成默认变量值 */
export function getDefaultValues(
  template: PromptTemplate,
): Record<string, string> {
  return defaultPromptValues(template.variables);
}

/** 校验必填变量 */
export function validateRequired(
  variables: PromptVariable[],
  values: Record<string, string>,
): string[] {
  return validatePromptValues(variables, values)
    .filter((issue) => issue.code === 'required')
    .map((issue) => issue.label);
}

/** 统计已填写变量数 */
export function filledVariableCount(
  variables: PromptVariable[],
  values: Record<string, string>,
): number {
  return variables.filter((v) => (values[v.key] ?? '').trim()).length;
}
