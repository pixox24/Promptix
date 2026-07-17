import type {
  AdminModel,
  ProviderConnection,
  ProviderTextTestJob,
} from '../types/adminModels';

export function eligibleProviderTextModels(
  provider: ProviderConnection,
  models: AdminModel[],
) {
  return models.filter((model) =>
    model.providerId === provider.id
    && provider.enabled
    && model.enabled
    && model.capabilities.includes('text'));
}

export function initialProviderTextTestModelId(models: AdminModel[]) {
  return models.find((model) => model.isDefaultText)?.id ?? models[0]?.id ?? '';
}

export function isProviderTextTestPending(status: ProviderTextTestJob['status']) {
  return status === 'pending' || status === 'queued' || status === 'running';
}

export function providerTextTestStatusAnnouncement(
  status: ProviderTextTestJob['status'] | null,
  errorMessage?: string | null,
) {
  switch (status) {
    case 'pending': return 'Connection test is pending.';
    case 'queued': return 'Connection test is queued.';
    case 'running': return 'Connection test is running.';
    case 'succeeded': return 'Connection and text call succeeded.';
    case 'failed': return errorMessage
      ? `Connection test failed. ${errorMessage}`
      : 'Connection test failed.';
    case 'cancelled': return 'Connection test was cancelled.';
    default: return '';
  }
}
