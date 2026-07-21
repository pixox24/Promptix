import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldProtectTemplateNavigation, type TemplateNavigationIntent } from '../src/lib/templateDetailNavigation';

const ordinaryClick: TemplateNavigationIntent = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

test('protects an ordinary click only when the studio is dirty', () => {
  assert.equal(shouldProtectTemplateNavigation(ordinaryClick, true), true);
  assert.equal(shouldProtectTemplateNavigation(ordinaryClick, false), false);
});

test('preserves browser-native modified and non-primary navigation', () => {
  assert.equal(shouldProtectTemplateNavigation({ ...ordinaryClick, ctrlKey: true }, true), false);
  assert.equal(shouldProtectTemplateNavigation({ ...ordinaryClick, metaKey: true }, true), false);
  assert.equal(shouldProtectTemplateNavigation({ ...ordinaryClick, shiftKey: true }, true), false);
  assert.equal(shouldProtectTemplateNavigation({ ...ordinaryClick, button: 1 }, true), false);
});

