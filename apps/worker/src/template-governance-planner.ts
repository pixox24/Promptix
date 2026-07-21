import {
  DEFAULT_GOVERNANCE_RULES,
  classifyGovernanceRisk,
  governanceProposalOutputSchema,
  type GovernanceProposalOutput,
  type GovernanceField,
  type GovernanceRuleSet,
  type TemplateVersionSnapshot,
} from '@promptix/shared';

export class GovernancePlannerError extends Error {
  code = 'INVALID_GOVERNANCE_OUTPUT' as const;
}

export function normalizeGovernanceProposal(input: {
  raw: unknown;
  before: TemplateVersionSnapshot;
  taxonomySlugs: Set<string>;
  rules?: GovernanceRuleSet;
  batchSize?: number;
}) {
  const parsed = governanceProposalOutputSchema.safeParse(input.raw);
  if (!parsed.success) throw new GovernancePlannerError('Model returned malformed governance output');
  const proposal = parsed.data;
  const semantic = proposal.proposedPatch.semantic;
  if (semantic) {
    const supplied = [semantic.outputType, ...semantic.scenarios, ...semantic.styles, ...semantic.subjects].filter((value): value is string => Boolean(value));
    const invented = supplied.filter((slug) => !input.taxonomySlugs.has(slug));
    if (invented.length) throw new GovernancePlannerError(`Unknown taxonomy slugs: ${invented.join(', ')}`);
  }
  const changedFields = Object.keys(proposal.proposedPatch) as GovernanceField[];
  const decision = classifyGovernanceRisk({
    action: proposal.action,
    changedFields,
    confidence: proposal.confidence,
    batchSize: input.batchSize ?? 1,
  }, input.rules ?? DEFAULT_GOVERNANCE_RULES);
  return {
    ...proposal,
    baseVersion: input.before.version,
    current: input.before,
    riskLevel: decision.riskLevel,
    requiresApproval: decision.requiresApproval,
    automatic: decision.automatic,
  };
}

export function normalizeGovernanceBatch(input: {
  raw: unknown;
  snapshots: Map<string, TemplateVersionSnapshot>;
  taxonomySlugs: Set<string>;
  rules?: GovernanceRuleSet;
}) {
  if (!Array.isArray(input.raw)) throw new GovernancePlannerError('Model output must be an array');
  const parsed: GovernanceProposalOutput[] = input.raw.map((raw) => governanceProposalOutputSchema.parse(raw));
  return parsed.map((raw) => {
    const before = input.snapshots.get(raw.templateId);
    if (!before) throw new GovernancePlannerError(`Missing before snapshot for ${raw.templateId}`);
    return normalizeGovernanceProposal({ raw, before, taxonomySlugs: input.taxonomySlugs, rules: input.rules, batchSize: parsed.length });
  });
}
