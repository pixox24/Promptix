import type { AutopublishRecoveryAction } from '@promptix/shared';
import { api } from '../lib/api';
import type {
  AutopublishActionInput,
  AutopublishCreateResponse,
  AutopublishRunView,
  CreateImageRunInput,
  CreateTextRunInput,
} from '../types/autopublish';

export const createTextAutopublishRun = (input: CreateTextRunInput) =>
  api<AutopublishCreateResponse>('/api/admin/autopublish/runs', {
    method: 'POST',
    body: JSON.stringify({ ...input, triggerType: 'delegated' }),
  });

export async function createImageAutopublishRun(input: CreateImageRunInput) {
  const body = new FormData();
  body.set('image', input.file);
  body.set('flowType', 'image_reverse');
  body.set('idempotencyKey', input.idempotencyKey);
  body.set('allowAutomaticRepair', String(input.allowAutomaticRepair ?? true));
  if (input.modelId) body.set('modelId', input.modelId);
  if (input.visionModelId) body.set('visionModelId', input.visionModelId);
  return api<AutopublishCreateResponse>('/api/admin/autopublish/runs', { method: 'POST', body });
}

export const getAutopublishRun = (runId: string) =>
  api<AutopublishRunView>(`/api/admin/autopublish/runs/${runId}`);

export const cancelAutopublishRun = (runId: string) =>
  api<AutopublishRunView>(`/api/admin/autopublish/runs/${runId}/cancel`, {
    method: 'POST', body: JSON.stringify({}),
  });

export const performAutopublishAction = (
  runId: string,
  action: AutopublishRecoveryAction,
  input: AutopublishActionInput,
) => api<AutopublishRunView>(`/api/admin/autopublish/runs/${runId}/actions/${action}`, {
  method: 'POST',
  body: JSON.stringify(input),
});

export const listAutopublishExceptions = () =>
  api<AutopublishRunView[]>('/api/admin/autopublish/exceptions');
