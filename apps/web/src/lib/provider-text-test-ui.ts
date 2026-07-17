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
