import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webRoot = new URL('../src/', import.meta.url);

test('text and image ingest keep manual review and expose separate autopublish actions', async () => {
  const text = await readFile(new URL('components/admin/ingest/TextOptimizeFlow.tsx', webRoot), 'utf8');
  const image = await readFile(new URL('components/admin/ingest/ImageReverseFlow.tsx', webRoot), 'utf8');
  for (const source of [text, image]) {
    assert.match(source, /TemplateDraftReview/);
    assert.match(source, /AutopublishAction/);
    assert.match(source, /AutopublishRunCard/);
  }
});

test('one-click publishing keeps repair as a per-run advanced choice', async () => {
  const action = await readFile(new URL('components/admin/autopublish/AutopublishAction.tsx', webRoot), 'utf8');
  assert.match(action, /一键自动发布/);
  assert.match(action, /allowAutomaticRepair/);
  assert.match(action, /<details/);
  assert.doesNotMatch(action, /minimumOverallScore|minimumCriticalDimensionScore|permit/i);
});

test('progress card announces stage changes and renders only server actions', async () => {
  const card = await readFile(new URL('components/admin/autopublish/AutopublishRunCard.tsx', webRoot), 'utf8');
  assert.match(card, /aria-live="polite"/);
  assert.match(card, /nextAllowedActions/);
  assert.match(card, /observationUntil/);
  assert.match(card, /可以离开此页面/);
});
