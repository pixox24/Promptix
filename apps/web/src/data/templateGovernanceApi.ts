import { api } from '../lib/api';
import type { GovernanceActiveRules, GovernanceChangeSetPreview, GovernanceQueueCount, GovernanceRunDetail, GovernanceRunSummary, GovernanceTemplateDetail, GovernanceTemplatePage } from '../types/templateGovernance';
import type { GovernanceRuleSet } from '@promptix/shared';

export const fetchGovernanceQueues = (signal?: AbortSignal) => api<GovernanceQueueCount[]>('/api/admin/governance/queues', { signal });
export const fetchGovernanceTemplates = (params: URLSearchParams, signal?: AbortSignal) => api<GovernanceTemplatePage>(`/api/admin/governance/templates?${params}`, { signal });
export const fetchGovernanceTemplate = (id: string, signal?: AbortSignal) => api<GovernanceTemplateDetail>(`/api/admin/governance/templates/${encodeURIComponent(id)}`, { signal });
export const createGovernanceRun = (input: unknown) => api<{ id: string; status: string }>('/api/admin/governance/runs', { method: 'POST', body: JSON.stringify(input) });
export const fetchGovernanceRuns = (signal?: AbortSignal) => api<{ items: GovernanceRunSummary[] }>('/api/admin/governance/runs?limit=50', { signal });
export const fetchGovernanceRun = (id: string, signal?: AbortSignal) => api<GovernanceRunDetail>(`/api/admin/governance/runs/${encodeURIComponent(id)}`, { signal });
export const fetchGovernanceChangeSetPreview = (id: string, signal?: AbortSignal) => api<GovernanceChangeSetPreview>(`/api/admin/governance/change-sets/${encodeURIComponent(id)}/preview`, { signal });
export const fetchActiveGovernanceRules = () => api<GovernanceActiveRules>('/api/admin/governance/rule-sets/active');
export const saveActiveGovernanceRules = (rules: GovernanceRuleSet) => api<GovernanceActiveRules>('/api/admin/governance/rule-sets/active', { method: 'PUT', body: JSON.stringify(rules) });
export const approveGovernanceChangeSet = (id: string, input: unknown) => api(`/api/admin/governance/change-sets/${id}/approve`, { method: 'POST', body: JSON.stringify(input) });
export const rejectGovernanceChangeSet = (id: string, input: unknown) => api(`/api/admin/governance/change-sets/${id}/reject`, { method: 'POST', body: JSON.stringify(input) });
export const retryGovernanceChangeSet = (id: string, input: unknown) => api(`/api/admin/governance/change-sets/${id}/retry`, { method: 'POST', body: JSON.stringify(input) });
export const rollbackGovernanceChangeSet = (id: string, input: unknown) => api(`/api/admin/governance/change-sets/${id}/rollback`, { method: 'POST', body: JSON.stringify(input) });
