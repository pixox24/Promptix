import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('similar templates use dual, single and bottom responsive placements', async () => {
  const [detailSource, pageSource, cssSource, compactCardSource, railSource] = await Promise.all([
    readFile(new URL('../src/components/detail/PromptStudioDetail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/DetailPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/detail/SimilarTemplateCompactCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/detail/SimilarTemplateRail.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(pageSource, /max-w-\[2240px\]/);
  assert.match(detailSource, /similar-template-rail-left-tall/);
  assert.match(detailSource, /similar-template-rail-left-short/);
  assert.match(detailSource, /similar-template-rail-single-tall/);
  assert.match(detailSource, /similar-template-rail-single-short/);
  assert.match(detailSource, /similar-template-rail-right-tall/);
  assert.match(detailSource, /similar-template-rail-right-short/);
  assert.match(detailSource, /detail-similar-bottom/);
  assert.match(detailSource, /detail-similar-mobile-row/);
  assert.match(detailSource, /onNavigateRequest=\{requestNavigation\}/);
  assert.match(cssSource, /@media \(min-width:1536px\)/);
  assert.match(cssSource, /@media \(min-width:1800px\)/);
  assert.match(cssSource, /max-height:779px/);
  assert.match(cssSource, /clamp\(15rem/);
  assert.match(cssSource, /similar-template-card:hover \.similar-template-card-overlay/);
  assert.match(cssSource, /@media \(hover:none\)/);
  assert.match(railSource, /similar-template-rail-track/);
  assert.match(cssSource, /\.similar-template-rail\s*\{\s*position:sticky/);
  assert.match(cssSource, /align-self:stretch/);
  assert.match(cssSource, /@media \(min-width:768px\)/);
  assert.match(cssSource, /\.detail-similar-bottom\s*\{\s*display:none/);
  assert.match(compactCardSource, /aspect-\[3\/4\]/);
  assert.match(compactCardSource, /object-cover/);
  assert.match(compactCardSource, /similar-template-card-overlay/);
  assert.doesNotMatch(compactCardSource, /IconCopy|IconHeart|template\.tags/);
});
