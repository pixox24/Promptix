import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { recommendationTemplateTarget } from '../src/lib/recommendationNavigation';

const read = (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('recommendation navigation carries only the opaque request id', () => {
  assert.equal(
    recommendationTemplateTarget(
      'template-b',
      '1b65dcb6-c22d-4ca8-822f-2e24c46faf62',
    ),
    '/template/template-b?recRequest=1b65dcb6-c22d-4ca8-822f-2e24c46faf62',
  );
  assert.equal(
    recommendationTemplateTarget('template-b', null),
    '/template/template-b',
  );
});

test('similar templates load from the API without falling back to stale static data', async () => {
  const [hook, api, detail, studio] = await Promise.all([
    read('hooks/useSimilarTemplates.ts'),
    read('data/templateApi.ts'),
    read('pages/DetailPage.tsx'),
    read('components/detail/PromptStudioDetail.tsx'),
  ]);

  assert.match(api, /\/similar\?limit=4/);
  assert.match(api, /recommendation-events/);
  assert.doesNotMatch(hook, /getSimilarTemplates/);
  assert.doesNotMatch(hook, /VITE_SIMILAR_TEMPLATE_STATIC_FALLBACK/);
  assert.match(hook, /\.catch\([\s\S]*items:\s*\[\]/);
  assert.match(hook, /\.catch\([\s\S]*unavailable:\s*true/);
  assert.match(hook, /requestId:\s*null/);
  assert.match(hook, /source:\s*'fallback'/);
  assert.doesNotMatch(detail, /getStaticTemplateById/);
  assert.match(detail, /similarUnavailable=\{similar\.unavailable\}/);
  assert.match(studio, /相似模板暂不可用/);
});

test('impressions require half visibility for one second and dedupe replicas', async () => {
  const hook = await read('hooks/useRecommendationImpression.ts');

  assert.match(hook, /threshold:\s*0\.5/);
  assert.match(hook, /1000/);
  assert.match(hook, /reportedImpressions/);
  assert.match(hook, /clearTimeout/);
});

test('generation attribution retries once without an expired context', async () => {
  const [generationHook, detail] = await Promise.all([
    read('hooks/usePublicGeneration.ts'),
    read('pages/DetailPage.tsx'),
  ]);

  assert.match(generationHook, /RECOMMENDATION_REQUEST_INVALID/);
  assert.match(generationHook, /recommendationRequestId/);
  assert.match(detail, /recommendationContextSchema/);
  assert.match(detail, /recRequest/);
});
