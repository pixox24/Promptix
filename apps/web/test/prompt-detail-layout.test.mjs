import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detailPath = new URL('../src/pages/DetailPage.tsx', import.meta.url);
const variableFormPath = new URL(
  '../src/components/template/VariableForm.tsx',
  import.meta.url,
);
const promptPreviewPath = new URL(
  '../src/components/template/PromptPreview.tsx',
  import.meta.url,
);
const stylesPath = new URL('../src/index.css', import.meta.url);

test('composes the desktop detail experience as one viewport-bound workspace', async () => {
  const source = await readFile(detailPath, 'utf8');

  assert.match(source, /data-testid="prompt-detail-workspace"/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(420px,0\.95fr\)\]/);
  assert.match(source, /xl:h-\[calc\(100dvh-8\.5rem\)\]/);
  assert.match(source, /xl:min-h-\[640px\]/);
  assert.match(source, /xl:max-h-\[820px\]/);
});

test('offers compact detail variants for dense variable and prompt controls', async () => {
  const [variableSource, previewSource] = await Promise.all([
    readFile(variableFormPath, 'utf8'),
    readFile(promptPreviewPath, 'utf8'),
  ]);

  assert.match(variableSource, /compact\?: boolean/);
  assert.match(variableSource, /compact \? 'space-y-4'/);
  assert.match(variableSource, /detail-choice-chip/);
  assert.match(previewSource, /compact\?: boolean/);
  assert.match(previewSource, /detail-prompt-surface/);
});

test('keeps media metadata and variable actions inside the shared workspace', async () => {
  const source = await readFile(detailPath, 'utf8');

  assert.match(source, /data-testid="prompt-detail-media"/);
  assert.match(source, /detail-media-scrim/);
  assert.match(source, /data-testid="prompt-detail-panel"/);
  assert.match(source, /data-testid="prompt-variable-scroll"/);
  assert.match(source, /data-testid="prompt-action-footer"/);

  const workspaceStart = source.indexOf('data-testid="prompt-detail-workspace"');
  const similarStart = source.indexOf('{/* Similar */}');
  const actionFooter = source.indexOf('data-testid="prompt-action-footer"');

  assert.ok(workspaceStart >= 0 && actionFooter > workspaceStart);
  assert.ok(similarStart > actionFooter, 'similar templates must remain after the core workspace');
});

test('keeps the large media layers capture-friendly without backdrop filters', async () => {
  const [detailSource, stylesSource] = await Promise.all([
    readFile(detailPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
  ]);
  const scrimRule = stylesSource.match(/\.detail-media-scrim\s*\{[\s\S]*?\}/)?.[0] ?? '';

  assert.doesNotMatch(scrimRule, /backdrop-filter/);
  assert.doesNotMatch(detailSource, /bg-slate-950\/55[^'"\n]*backdrop-blur/);
});
