import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { summarizeRecommendationMetrics } from '../dist/services/recommendation-metrics-service.js';

test('recommendation metrics calculate CTR, CVR, and zero denominators', () => {
  assert.deepEqual(summarizeRecommendationMetrics([], 30), {
    days: 30,
    impressions: 0,
    clicks: 0,
    generationSuccesses: 0,
    ctr: 0,
    cvr: 0,
    positions: [],
  });

  const metrics = summarizeRecommendationMetrics([
    { position: 1, impressions: 10, clicks: 4, generationSuccesses: 2 },
    { position: 2, impressions: 5, clicks: 1, generationSuccesses: 1 },
  ], 30);
  assert.equal(metrics.ctr, 1 / 3);
  assert.equal(metrics.cvr, 0.6);
  assert.equal(metrics.positions[0].ctr, 0.4);
});

test('admin recommendation metrics endpoint is authenticated and bounded', async () => {
  const source = await readFile(
    new URL('../src/routes/templates.ts', import.meta.url),
    'utf8',
  );
  const authIndex = source.indexOf("adminTemplateRoutes.use('*', requireAdmin)");
  const metricsIndex = source.indexOf("adminTemplateRoutes.get('/:id/recommendation-metrics'");

  assert.ok(authIndex >= 0);
  assert.ok(metricsIndex > authIndex);
  assert.match(source, /days must be an integer between 1 and 90/);
});
