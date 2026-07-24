import { autopublishRulesSchema, type AutopublishRules } from '@promptix/shared';

export function parseStoredAutopublishRules(value: unknown): AutopublishRules {
  const stored = value && typeof value === 'object'
    ? (value as { autopublish?: unknown })
    : {};
  return autopublishRulesSchema.parse(stored.autopublish ?? value);
}
