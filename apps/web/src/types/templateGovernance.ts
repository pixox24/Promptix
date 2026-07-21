import type { GovernanceChangeSetStatus, GovernanceProposalStatus, GovernanceQueueId, GovernanceRuleSet, GovernanceRunStatus, GovernanceSelectionScope, GovernanceTemplateQuery } from '@promptix/shared';

export type GovernanceTemplateRow = { id: string; name: string; summary: string; status: string; source: string; taxonomyReviewStatus: string; isFeatured: boolean; featuredOrder: number; coverUrl: string | null; currentVersion: number; updatedAt: string };
export type GovernanceTemplatePage = { items: GovernanceTemplateRow[]; total: number; nextCursor: string | null; querySnapshot: GovernanceTemplateQuery & { capturedAt: string } };
export type GovernanceQueueCount = { id: GovernanceQueueId; count: number };
export type GovernanceTemplateDetail = { template: GovernanceTemplateRow & Record<string, unknown>; currentSnapshot: unknown; activeProposal: null | { id: string; action: string; proposedPatch: Record<string, unknown>; reasonCodes: string[]; explanation: string; confidence: string; riskLevel: string; requiresApproval: boolean; status: GovernanceProposalStatus }; history: unknown[]; approval: null | { changeSet: null | { id: string; status: GovernanceChangeSetStatus; ruleSetVersion: number; rollbackUntil?: string | null; summary?: Record<string, number> }; decision: unknown }; validation: { valid: boolean; issues: Array<{ code: string; message: string }> } };
export type GovernanceSelection = GovernanceSelectionScope | { mode: 'explicit'; templateIds: string[]; proposalIds: string[] };
export type GovernanceActiveRules = { id: string; version: number; rules: GovernanceRuleSet; scheduler?: { error?: string | null } };

export type GovernanceRunSummary = {
  id: string;
  trigger: 'manual' | 'scheduled';
  goal: string;
  status: GovernanceRunStatus;
  promptVersion: string;
  ruleSetVersion: number;
  modelId: string | null;
  model: { id: string; name: string | null; modelId: string | null } | null;
  progress: null | { phase?: string; percent?: number };
  stats: null | Record<string, number>;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type GovernanceProposalDetail = {
  id: string;
  templateId: string;
  baseVersion: number;
  currentSnapshot: Record<string, unknown>;
  action: string;
  proposedPatch: Record<string, unknown>;
  reasonCodes: string[];
  explanation: string;
  confidence: string;
  riskLevel: string;
  requiresApproval: boolean;
  status: GovernanceProposalStatus;
};

export type GovernanceChangeSetSummary = {
  id: string;
  runId: string;
  status: GovernanceChangeSetStatus;
  summary: Record<string, number>;
  rollbackUntil: string | null;
  createdAt: string;
  updatedAt: string;
};
export type GovernanceAuditEvent = { id: string; actorType: 'admin' | 'agent' | 'system'; eventType: string; targetType: string; targetId: string; runId: string | null; changeSetId: string | null; proposalId: string | null; payload: Record<string, unknown>; createdAt: string };

export type GovernanceRunDetail = GovernanceRunSummary & {
  requestPreview: { goal: string; promptVersion: string; ruleSetVersion: number; templateCount: number; signalCount: number; templateIds: string[] };
  job: null | { id: string; status: string; errorCode: string | null; errorMessage: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null };
  proposals: GovernanceProposalDetail[];
  changeSets: GovernanceChangeSetSummary[];
  audits: GovernanceAuditEvent[];
};

export type GovernanceChangeSetPreview = {
  changeSet: GovernanceChangeSetSummary;
  items: Array<{ id: string; status: string; errorCode?: string | null; errorMessage?: string | null; proposal: GovernanceProposalDetail }>;
};
