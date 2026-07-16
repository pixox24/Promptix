export type ProviderAdapter =
  | 'openai_compatible'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom_65535_async';

export type ModelCapability =
  | 'text'
  | 'vision'
  | 'image'
  | 'structured_output';

export type ProviderConnection = {
  id: string;
  name: string;
  adapterType: ProviderAdapter;
  baseUrl: string;
  apiKeyEnv?: string | null;
  apiKeyConfigured: boolean;
  authStyle: 'bearer' | 'header';
  enabled: boolean;
};

export type AdminModel = {
  id: string;
  providerId: string;
  providerName: string;
  providerEnabled: boolean;
  adapterType: ProviderAdapter;
  apiKeyConfigured: boolean;
  name: string;
  modelId: string;
  capabilities: ModelCapability[];
  defaults: Record<string, unknown>;
  enabled: boolean;
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};
