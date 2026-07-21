export type GovernanceQualityInput = {
  id: string;
  name: string;
  summary: string;
  promptTemplate: string;
  variables: Array<{ key: string }>;
  coverUrl?: string | null;
  taxonomyReviewStatus: string;
  unmappedTerms: unknown[];
  confidence?: Record<string, number | undefined>;
};

export type GovernanceQualitySignal = { code: string; severity: 'attention' | 'critical'; detail: string };

export type GovernanceSignalBundle = {
  templateId: string;
  issues: GovernanceQualitySignal[];
  duplicateCandidates: Array<{ id: string; similarity: number }>;
};

const placeholders = (prompt: string) => [...prompt.matchAll(/{{\s*([a-zA-Z0-9_-]+)\s*}}/g)].map((match) => match[1]);
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (value: string) => new Set(normalize(value).split(/\s+/).filter(Boolean));

export function duplicateSimilarity(left: GovernanceQualityInput, right: GovernanceQualityInput) {
  const a = tokens(`${left.name} ${left.summary} ${left.promptTemplate}`);
  const b = tokens(`${right.name} ${right.summary} ${right.promptTemplate}`);
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

export function findDuplicateCandidates(target: GovernanceQualityInput, library: GovernanceQualityInput[], limit = 10) {
  return library.filter((item) => item.id !== target.id)
    .map((item) => ({ id: item.id, similarity: duplicateSimilarity(target, item) }))
    .filter((item) => item.similarity >= 0.82)
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, Math.min(limit, 20)));
}

export function evaluateTemplateQuality(input: GovernanceQualityInput): GovernanceQualitySignal[] {
  const signals: GovernanceQualitySignal[] = [];
  if (input.taxonomyReviewStatus !== 'reviewed') signals.push({ code: 'TAXONOMY_MISSING', severity: 'attention', detail: '分类尚未人工确认' });
  if (input.unmappedTerms.length) signals.push({ code: 'TAXONOMY_UNMAPPED', severity: 'attention', detail: `存在 ${input.unmappedTerms.length} 个未映射分类词` });
  if (Object.values(input.confidence ?? {}).some((value) => typeof value === 'number' && value < 0.85)) signals.push({ code: 'TAXONOMY_LOW_CONFIDENCE', severity: 'attention', detail: '分类置信度低于自动处理阈值' });
  if (!input.coverUrl) signals.push({ code: 'COVER_MISSING', severity: 'attention', detail: '缺少封面' });
  if (normalize(input.name).length < 4) signals.push({ code: 'TITLE_UNCLEAR', severity: 'attention', detail: '标题过短或含义不清' });
  if (normalize(input.summary).length < 12) signals.push({ code: 'SUMMARY_UNCLEAR', severity: 'attention', detail: '摘要为空或信息不足' });
  if (normalize(input.promptTemplate).length < 20) signals.push({ code: 'PROMPT_WEAK', severity: 'critical', detail: 'Prompt 骨架信息不足' });
  const declared = new Set(input.variables.map((variable) => variable.key));
  const unresolved = [...new Set(placeholders(input.promptTemplate).filter((key) => !declared.has(key)))];
  if (unresolved.length) signals.push({ code: 'UNRESOLVED_VARIABLES', severity: 'critical', detail: `未声明变量：${unresolved.join(', ')}` });
  return signals;
}

export function buildGovernanceSignals(inputs: GovernanceQualityInput[]): GovernanceSignalBundle[] {
  return inputs.map((input) => ({
    templateId: input.id,
    issues: evaluateTemplateQuality(input),
    duplicateCandidates: findDuplicateCandidates(input, inputs),
  }));
}
