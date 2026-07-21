import type { GovernanceProposalStatus, GovernanceQueueId, GovernanceRuleSet, GovernanceSelectionScope, GovernanceTemplateQuery } from '@promptix/shared';

export type GovernanceTemplateRow = { id: string; name: string; summary: string; status: string; source: string; taxonomyReviewStatus: string; isFeatured: boolean; featuredOrder: number; coverUrl: string | null; currentVersion: number; updatedAt: string };
export type GovernanceTemplatePage = { items: GovernanceTemplateRow[]; total: number; nextCursor: string | null; querySnapshot: GovernanceTemplateQuery & { capturedAt: string } };
export type GovernanceQueueCount = { id: GovernanceQueueId; count: number };
export type GovernanceTemplateDetail = { template: GovernanceTemplateRow & Record<string, unknown>; currentSnapshot: unknown; activeProposal: null | { id: string; proposedPatch: Record<string, unknown>; reasonCodes: string[]; explanation: string; confidence: string; riskLevel: string; requiresApproval: boolean; status: GovernanceProposalStatus }; history: unknown[]; approval: unknown; validation: { valid: boolean; issues: Array<{ code: string; message: string }> } };
export type GovernanceSelection = GovernanceSelectionScope | { mode: 'explicit'; templateIds: string[]; proposalIds: string[] };
export type GovernanceActiveRules = { id: string; version: number; rules: GovernanceRuleSet; scheduler?: { error?: string | null } };
