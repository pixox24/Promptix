import type { PromptTemplate, PromptVariable } from '../types/prompt';

/** 根据模板与变量值生成完整 Prompt */
export function buildPrompt(
  template: PromptTemplate,
  values: Record<string, string>,
): string {
  let result = template.promptTemplate;

  for (const variable of template.variables) {
    const raw = values[variable.key] ?? variable.defaultValue ?? '';
    const value = raw.trim();
    const token = `{{${variable.key}}}`;

    if (!value) {
      // 空值时尽量清理多余标点与空格
      result = result
        .replace(`, ${token}`, '')
        .replace(`${token}, `, '')
        .replace(token, '');
    } else {
      result = result.replaceAll(token, value);
    }
  }

  // 清理残留占位符与多余空白
  result = result
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .trim();

  return result;
}

/** 从模板生成默认变量值 */
export function getDefaultValues(
  template: PromptTemplate,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const v of template.variables) {
    values[v.key] = v.defaultValue ?? '';
  }
  return values;
}

/** 校验必填变量 */
export function validateRequired(
  variables: PromptVariable[],
  values: Record<string, string>,
): string[] {
  return variables
    .filter((v) => v.required && !(values[v.key] ?? '').trim())
    .map((v) => v.label);
}

/** 统计已填写变量数 */
export function filledVariableCount(
  variables: PromptVariable[],
  values: Record<string, string>,
): number {
  return variables.filter((v) => (values[v.key] ?? '').trim()).length;
}
