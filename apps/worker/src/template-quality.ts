import { renderPromptTemplate, type TemplateDraft, type TemplateQualityIssue } from '@promptix/shared';

export function inspectTemplateQuality(draft: TemplateDraft): TemplateQualityIssue[] {
  const issues: TemplateQualityIssue[] = [];
  const variables = draft.variables.filter((variable) => variable.defaultValue?.trim());
  for (let leftIndex = 0; leftIndex < variables.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variables.length; rightIndex += 1) {
      const left = variables[leftIndex];
      const right = variables[rightIndex];
      const leftValue = left.defaultValue!.trim();
      const rightValue = right.defaultValue!.trim();
      if (Math.min(leftValue.length, rightValue.length) >= 3 &&
          (leftValue.includes(rightValue) || rightValue.includes(leftValue))) {
        issues.push({
          code: 'OVERLAPPING_DEFAULT_VALUES', severity: 'warning',
          variableKeys: [left.key, right.key],
          message: `${left.label}与${right.label}的默认内容互相包含，可能导致提示词重复。`,
        });
      }
    }
  }

  for (const variable of variables) {
    const token = `{{${variable.key}}}`;
    const tokenIndex = draft.promptTemplate.indexOf(token);
    if (tokenIndex < 0) continue;
    const prefix = draft.promptTemplate.slice(Math.max(0, tokenIndex - 4), tokenIndex);
    const value = variable.defaultValue!.trim();
    const overlap = [4, 3, 2].find(length => prefix.slice(-length) && value.startsWith(prefix.slice(-length)));
    if (overlap) {
      issues.push({
        code: 'DUPLICATE_TOKEN_CONTEXT', severity: 'warning', variableKeys: [variable.key],
        message: `${variable.label}的默认值与占位符前固定文本重复，渲染后可能出现重复措辞。`,
      });
    }
  }

  for (const variable of draft.variables) {
    if ((variable.type !== 'select' && variable.type !== 'ratio') || !variable.defaultValue) continue;
    const token = `{{${variable.key}}}`;
    const fixedTemplate = draft.promptTemplate.replaceAll(token, '');
    if (variable.defaultValue.length >= 3 && fixedTemplate.includes(variable.defaultValue)) {
      issues.push({
        code: 'SELECT_FIXED_TEXT_CONFLICT', severity: 'warning', variableKeys: [variable.key],
        message: `${variable.label}的默认选项同时写入了固定提示词，切换其他选项后可能产生冲突。`,
      });
    }
    for (const option of variable.options ?? []) {
      const renderedOption = renderPromptTemplate(draft, Object.fromEntries(draft.variables.map(item => [item.key, item.key === variable.key ? option : item.defaultValue ?? ''])));
      if (!renderedOption || /\{\{[^}]+\}\}/.test(renderedOption) || /([，,。])\1/.test(renderedOption)) {
        issues.push({ code: 'SUSPICIOUS_PROMPT_OUTPUT', severity: 'error', variableKeys: [variable.key], message: `${variable.label}的选项“${option}”代入后提示词结构异常。` });
        break;
      }
    }
  }

  const rendered = renderPromptTemplate(draft, Object.fromEntries(draft.variables.map(variable => [variable.key, variable.defaultValue ?? ''])));
  if (!rendered || /\{\{[^}]+\}\}/.test(rendered) || /([，,。])\1/.test(rendered)) {
    issues.push({ code: 'SUSPICIOUS_PROMPT_OUTPUT', severity: 'error', variableKeys: [], message: '使用默认值渲染后的提示词为空、包含未解析变量或异常重复标点。' });
  }
  return issues;
}
