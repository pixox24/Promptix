import type { ModelCapability, ProviderAdapter } from '@promptix/shared';

export type ProviderConnection = {
  id: string;
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv: string | null;
  authStyle: string;
  enabled: boolean;
  protocol: string;
  kind: string;
  defaultModel: string;
  defaults: unknown;
  isDefault: boolean;
};

export type ModelRecord = {
  id: string;
  providerId: string;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaults: unknown;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

export type ResolvedModel = {
  provider: ProviderConnection;
  model: ModelRecord;
};

export function hasCapability(model: ModelRecord, capability: ModelCapability) {
  return model.capabilities.includes(capability);
}
