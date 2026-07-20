import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTemplateCoverRequest, templateCoverFingerprint } from '../dist/lib/template-cover.js';

const template = (overrides = {}) => ({
  id: 'demo',
  promptTemplate: '主体 {{subject}}，比例 {{ratio}}',
  variables: [
    { id: 'v1', key: 'subject', label: '主体', type: 'text', defaultValue: '一只橘猫', suggestions: ['猫'] },
    { id: 'v2', key: 'ratio', label: '比例', type: 'ratio', options: ['4:5', '1:1'], defaultValue: '4:5' },
  ],
  negativePrompt: '模糊, 水印',
  ...overrides,
});

test('builds a rendered, auditable cover request', () => {
  const request = buildTemplateCoverRequest(template(), 'image_reverse_auto_cover');
  assert.match(request.prompt, /主体 一只橘猫/);
  assert.doesNotMatch(request.prompt, /\{\{/);
  assert.equal(request.aspectRatio, '4:5');
  assert.match(request.negativePrompt, /模糊/);
  assert.match(request.negativePrompt, /watermarks/);
  assert.equal(request.metadata.source, 'image_reverse_auto_cover');
  assert.equal(request.metadata.resolvedValues.subject, '一只橘猫');
});

test('uses suggestions and options when defaults are absent', () => {
  const request = buildTemplateCoverRequest(template({
    variables: [
      { id: 'v1', key: 'subject', label: '主体', type: 'text', suggestions: ['一只白猫'] },
      { id: 'v2', key: 'ratio', label: '比例', type: 'ratio', options: ['1:1'] },
    ],
  }), 'template_revision_cover');
  assert.equal(request.metadata.resolvedValues.subject, '一只白猫');
  assert.equal(request.aspectRatio, '1:1');
});

test('fingerprint changes only when cover inputs change', () => {
  assert.equal(templateCoverFingerprint(template()), templateCoverFingerprint(template({ name: 'different' })));
  assert.notEqual(templateCoverFingerprint(template()), templateCoverFingerprint(template({ negativePrompt: '新的负面词' })));
});

test('rejects unresolved placeholders', () => {
  assert.throws(() => buildTemplateCoverRequest(template({ promptTemplate: '{{unknown}}' }), 'template_revision_cover'), /TEMPLATE_UNKNOWN_VARIABLE/);
});
