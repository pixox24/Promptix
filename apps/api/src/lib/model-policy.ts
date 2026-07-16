type DefaultRoles = {
  isDefaultText: boolean;
  isDefaultVision: boolean;
  isDefaultImage: boolean;
};

type ModelIdentity = {
  providerId: string;
  modelId: string;
};

export function hasDefaultRole(value: DefaultRoles) {
  return value.isDefaultText || value.isDefaultVision || value.isDefaultImage;
}

export function modelIdentityChangeError(
  existing: ModelIdentity,
  patch: Partial<ModelIdentity> & Record<string, unknown>,
) {
  if (patch.providerId !== undefined && patch.providerId !== existing.providerId) {
    return 'Provider ownership is immutable; create a new model instead';
  }
  if (patch.modelId !== undefined && patch.modelId !== existing.modelId) {
    return 'The vendor model ID is immutable; create a new model instead';
  }
  return null;
}
