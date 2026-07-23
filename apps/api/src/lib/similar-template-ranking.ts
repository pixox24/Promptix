import type {
  PublicTemplate,
  RecommendationReasonCode,
  SemanticClassification,
} from '@promptix/shared';

export type RecommendationFeedback = {
  impressions: number;
  clicks: number;
  successes: number;
};

export type SimilarTemplateRankingInput = {
  source: PublicTemplate;
  candidates: PublicTemplate[];
  feedback: Map<string, RecommendationFeedback>;
  now: Date;
  limit: number;
};

export type RankedSimilarTemplate = {
  template: PublicTemplate;
  contentScore: number;
  score: number;
  reasonCodes: RecommendationReasonCode[];
  reasonLabel: string;
};

type Reason = {
  code: RecommendationReasonCode;
  label: string;
  score: number;
};

function semantic(template: PublicTemplate): SemanticClassification {
  return template.semantic ?? {
    workflowType: 'generate',
    outputType: null,
    scenarios: [],
    styles: [],
    subjects: [],
    tags: template.tags,
    unmappedTerms: [],
    confidence: {},
  };
}

function sharedValues(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter((value) => rightSet.has(value));
}

function tagSimilarity(left: string[], right: string[]) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return sharedValues(left, right).length / union.size;
}

function boundedLogScore(value: number, ceiling: number, reference: number) {
  return Math.min(ceiling, Math.log1p(Math.max(0, value)) / Math.log(reference + 1) * ceiling);
}

function freshnessScore(createdAt: string, now: Date) {
  const ageMs = Math.max(0, now.getTime() - Date.parse(createdAt));
  const ageDays = ageMs / 86_400_000;
  return Math.max(0, 4 * (1 - ageDays / 90));
}

function topReasons(reasons: Reason[], template: PublicTemplate) {
  const selected = reasons
    .filter((reason) => reason.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
  if (!selected.length) {
    selected.push({ code: 'popular', label: '近期常用', score: template.useCount });
  }
  return {
    reasonCodes: selected.map((reason) => reason.code),
    reasonLabel: selected.map((reason) => reason.label).join(' · '),
  };
}

export function rankSimilarTemplates({
  source,
  candidates,
  feedback,
  now,
  limit,
}: SimilarTemplateRankingInput): RankedSimilarTemplate[] {
  const sourceSemantic = semantic(source);
  const ranked = candidates.flatMap((template) => {
    const candidateSemantic = semantic(template);
    const reasons: Reason[] = [];
    let contentScore = 0;

    if (sourceSemantic.outputType && sourceSemantic.outputType === candidateSemantic.outputType) {
      contentScore += 35;
      reasons.push({
        code: 'same_output_type',
        label: '同类产出',
        score: 35,
      });
    }

    const scenarios = sharedValues(sourceSemantic.scenarios, candidateSemantic.scenarios).slice(0, 2);
    if (scenarios.length) {
      const score = scenarios.length * 9;
      contentScore += score;
      reasons.push({ code: 'shared_scenario', label: '使用场景相近', score });
    }

    const styles = sharedValues(sourceSemantic.styles, candidateSemantic.styles).slice(0, 2);
    if (styles.length) {
      const score = styles.length * 8;
      contentScore += score;
      reasons.push({ code: 'shared_style', label: '视觉风格相近', score });
    }

    const subjects = sharedValues(sourceSemantic.subjects, candidateSemantic.subjects).slice(0, 2);
    if (subjects.length) {
      const score = subjects.length * 6;
      contentScore += score;
      reasons.push({ code: 'shared_subject', label: '画面主体相近', score });
    }

    const sourceTags = sourceSemantic.tags.length ? sourceSemantic.tags : source.tags;
    const candidateTags = candidateSemantic.tags.length ? candidateSemantic.tags : template.tags;
    const sharedTags = sharedValues(sourceTags, candidateTags);
    const tagsScore = 12 * tagSimilarity(sourceTags, candidateTags);
    if (tagsScore > 0) {
      contentScore += tagsScore;
      reasons.push({
        code: 'shared_tags',
        label: `共享${sharedTags.slice(0, 2).join('、')}`,
        score: tagsScore,
      });
    }

    if (source.category === template.category) contentScore += 5;
    if (contentScore < 25) return [];

    const history = feedback.get(template.id) ?? { impressions: 0, clicks: 0, successes: 0 };
    const behaviorScore =
      8 * (history.successes + 2) / (history.clicks + 10) +
      4 * (history.clicks + 3) / (history.impressions + 20);
    const score =
      contentScore +
      boundedLogScore(template.useCount, 8, 5_000) +
      boundedLogScore(template.favoriteCount, 4, 2_000) +
      freshnessScore(template.createdAt, now) +
      Math.min(12, behaviorScore);
    const explanation = topReasons(reasons, template);

    return [{
      template,
      contentScore,
      score: Number(score.toFixed(4)),
      ...explanation,
    }];
  });

  ranked.sort((left, right) =>
    right.score - left.score ||
    right.template.useCount - left.template.useCount ||
    Date.parse(right.template.createdAt) - Date.parse(left.template.createdAt) ||
    left.template.id.localeCompare(right.template.id));

  return ranked.slice(0, Math.max(0, Math.min(12, limit)));
}
