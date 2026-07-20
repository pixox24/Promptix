export function normalizeProviderBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

export function normalizeModelId(value: string) {
  return value.trim().toLowerCase();
}

export function providerIdentity(value: { adapterType: string; baseUrl: string; apiKeyEnv?: string | null; authStyle: string }) {
  return [value.adapterType, normalizeProviderBaseUrl(value.baseUrl), (value.apiKeyEnv ?? '').trim().toUpperCase(), value.authStyle].join('|');
}
