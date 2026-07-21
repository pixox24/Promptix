import assert from 'node:assert/strict';
import test from 'node:test';
import { createPromptStudioDirtySignature, type PromptStudioEditableSnapshot } from '../src/lib/promptStudioDirtyState';

function snapshot(overrides: Partial<PromptStudioEditableSnapshot> = {}): PromptStudioEditableSnapshot {
  return {
    values: { subject: 'mountain', style: 'film' },
    promptMode: 'auto',
    manualPrompt: 'mountain, film',
    displayedImage: { kind: 'cover', url: '/cover.jpg' },
    ...overrides,
  };
}

test('dirty signature is stable when variable key insertion order changes', () => {
  assert.equal(
    createPromptStudioDirtySignature(snapshot()),
    createPromptStudioDirtySignature(snapshot({ values: { style: 'film', subject: 'mountain' } })),
  );
});

test('dirty signature changes for editable prompt studio fields', () => {
  const baseline = createPromptStudioDirtySignature(snapshot());
  const changed = [
    snapshot({ values: { subject: 'forest', style: 'film' } }),
    snapshot({ promptMode: 'manual' }),
    snapshot({ manualPrompt: 'a different prompt' }),
    snapshot({ displayedImage: { kind: 'generated', url: '/generated.jpg', width: 1024, height: 1536 } }),
  ];

  for (const value of changed) {
    assert.notEqual(createPromptStudioDirtySignature(value), baseline);
  }
});

