import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('detail preview follows the image and no longer stretches to editor height', async () => {
  const [detailSource, mediaSource, cssSource] = await Promise.all([
    readFile(new URL('../src/components/detail/PromptStudioDetail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/detail/MediaCard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(detailSource, /items-stretch/);
  assert.doesNotMatch(cssSource, /--media-card-height|--media-stage-height/);
  assert.match(detailSource, /media-sticky-track/);
  assert.match(cssSource, /--detail-sticky-top:5\.5rem/);
  assert.match(cssSource, /\.media-sticky-track\s*\{[^}]*align-self:stretch/s);
  assert.match(cssSource, /\.media-card\s*\{[^}]*position:sticky/s);
  assert.match(cssSource, /top:var\(--detail-sticky-top\)/);
  assert.match(cssSource, /\.media-stage-image\s*\{[^}]*max-height:calc\(100dvh - 13rem\)/s);
  assert.match(mediaSource, /object-contain/);
  assert.doesNotMatch(mediaSource, /object-cover/);
});
