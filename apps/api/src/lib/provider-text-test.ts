export type ProviderTextTestProblem =
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_KEY_NOT_CONFIGURED'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_PROVIDER_MISMATCH'
  | 'MODEL_DISABLED'
  | 'MODEL_CAPABILITY_MISMATCH';

type ProviderForTextTest = {
  id: string;
  enabled: boolean;
  apiKeyEnv: string | null;
};

type ModelForTextTest = {
  providerId: string;
  enabled: boolean;
  capabilities: readonly string[];
};

export const providerTextTestProblemResponse = {
  PROVIDER_DISABLED: { status: 409, message: 'Enable the provider before testing it' },
  PROVIDER_KEY_NOT_CONFIGURED: {
    status: 409,
    message: 'The provider key is not configured in the API environment',
  },
  MODEL_NOT_FOUND: { status: 404, message: 'Model not found' },
  MODEL_PROVIDER_MISMATCH: {
    status: 409,
    message: 'The selected model does not belong to this provider',
  },
  MODEL_DISABLED: { status: 409, message: 'Enable the model before testing it' },
  MODEL_CAPABILITY_MISMATCH: {
    status: 409,
    message: 'The selected model does not support text',
  },
} as const;

export function providerTextTestProblem(
  provider: ProviderForTextTest,
  model: ModelForTextTest | null,
  env: Record<string, string | undefined>,
): ProviderTextTestProblem | null {
  if (!provider.enabled) return 'PROVIDER_DISABLED';
  if (!provider.apiKeyEnv || !env[provider.apiKeyEnv]) return 'PROVIDER_KEY_NOT_CONFIGURED';
  if (!model) return 'MODEL_NOT_FOUND';
  if (model.providerId !== provider.id) return 'MODEL_PROVIDER_MISMATCH';
  if (!model.enabled) return 'MODEL_DISABLED';
  if (!model.capabilities.includes('text')) return 'MODEL_CAPABILITY_MISMATCH';
  return null;
}
