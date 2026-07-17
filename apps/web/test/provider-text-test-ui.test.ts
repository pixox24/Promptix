import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleProviderTextModels,
  initialProviderTextTestModelId,
  isProviderTextTestPending,
  providerTextTestStatusAnnouncement,
} from '../src/lib/provider-text-test-ui.ts';
import type { AdminModel, ProviderConnection } from '../src/types/adminModels.ts';

const provider: ProviderConnection = {
  id: 'provider-a', name: 'Provider A', adapterType: 'openai_compatible',
  baseUrl: 'https://example.invalid/v1', apiKeyConfigured: true,
  authStyle: 'bearer' as const, enabled: true,
};
const defaultText: AdminModel = {
  id: 'default-text', providerId: 'provider-a', providerName: 'Provider A',
  providerEnabled: true, adapterType: 'openai_compatible', apiKeyConfigured: true,
  name: 'Text', modelId: 'text-1', capabilities: ['text'], defaults: {},
  enabled: true, isDefaultText: true, isDefaultVision: false, isDefaultImage: false,
};
const imageOnly: AdminModel = { ...defaultText, id: 'image-only', capabilities: ['image'] };
const disabledText = { ...defaultText, id: 'disabled-text', enabled: false };
const otherProvider = { ...defaultText, id: 'other-provider', providerId: 'provider-b' };

test('only exposes enabled text models owned by the Provider', () => {
  const eligible = eligibleProviderTextModels(provider, [defaultText, imageOnly, disabledText, otherProvider]);
  assert.deepEqual(eligible.map((model) => model.id), ['default-text']);
  assert.equal(initialProviderTextTestModelId(eligible), 'default-text');
});

test('treats queued and running jobs as non-dismissible pending work', () => {
  assert.equal(isProviderTextTestPending('queued'), true);
  assert.equal(isProviderTextTestPending('running'), true);
  assert.equal(isProviderTextTestPending('succeeded'), false);
  assert.equal(isProviderTextTestPending('failed'), false);
});

test('uses distinct status announcements for connection test progress and terminal states', () => {
  assert.equal(providerTextTestStatusAnnouncement('queued'), 'Connection test is queued.');
  assert.equal(providerTextTestStatusAnnouncement('running'), 'Connection test is running.');
  assert.equal(providerTextTestStatusAnnouncement('succeeded'), 'Connection and text call succeeded.');
  assert.equal(
    providerTextTestStatusAnnouncement('failed', 'The upstream endpoint rejected the request.'),
    'Connection test failed. The upstream endpoint rejected the request.',
  );
});
