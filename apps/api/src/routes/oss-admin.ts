import { Hono } from 'hono';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { tryGetOss } from '../lib/oss.js';
import { fail, ok } from '../lib/response.js';

/**
 * Admin diagnostics for OSS. Real uploads go through template cover routes later.
 */
export const ossAdminRoutes = new Hono<AdminVars>();

ossAdminRoutes.use('*', requireAdmin);

ossAdminRoutes.get('/status', async (c) => {
  const oss = tryGetOss();
  return ok(c, {
    configured: Boolean(oss),
    prefixes: {
      templates: 'public/templates/',
      generations: 'temp/generations/',
      inputs: 'temp/inputs/',
      published: 'public/published/',
    },
    lifecycleNote: 'Configure OSS lifecycle: expire prefix temp/ after 7 days',
  });
});

/** Upload a tiny probe object under temp/ (skipped if OSS not configured). */
ossAdminRoutes.post('/probe', async (c) => {
  const oss = tryGetOss();
  if (!oss) {
    return fail(c, 'OSS_NOT_CONFIGURED', 'OSS credentials are not set', 503);
  }
  const key = `temp/generations/probe/${Date.now()}.txt`;
  const result = await oss.putObject({
    objectKey: key,
    body: Buffer.from('promptix-oss-probe'),
    contentType: 'text/plain',
  });
  return ok(c, result, 201);
});
