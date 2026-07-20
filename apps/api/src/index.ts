import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadEnv, loadEnvFile } from './config/env.js';
import { fail, ok } from './lib/response.js';
import { authRoutes } from './routes/auth.js';
import { ossAdminRoutes } from './routes/oss-admin.js';
import { adminTemplateRoutes, publicTemplateRoutes } from './routes/templates.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { providerRoutes } from './routes/providers.js';
import { modelRoutes } from './routes/models.js';
import { jobRoutes } from './routes/jobs.js';
import { ingestRoutes } from './routes/ingest.js';
import { generationRoutes } from './routes/generations.js';
import { mkdirSync } from 'node:fs';
import { localStorageRoot } from './lib/storage.js';
import path from 'node:path';

loadEnvFile();

const app = new Hono();

app.use('*', async (c, next) => {
  try {
    await next();
  } catch (err) {
    console.error('[api] unhandled', err);
    return fail(
      c,
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Internal error',
      500,
    );
  }
});

app.use('*', async (c, next) => {
  let webOrigin = 'http://localhost:5173';
  try {
    webOrigin = loadEnv().WEB_ORIGIN;
  } catch {
    // env may be incomplete during early health checks
  }
  const middleware = cors({
    origin: [webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  return middleware(c, next);
});

app.get('/health', (c) => ok(c, { ok: true }));
app.get('/api/health', (c) => ok(c, { ok: true }));

app.route('/api/admin/auth', authRoutes);
app.route('/api/admin/oss', ossAdminRoutes);
app.route('/api/admin/templates', adminTemplateRoutes);
app.route('/api/templates', publicTemplateRoutes);
app.route('/api/admin/providers', providerRoutes);
app.route('/api/admin/models', modelRoutes);
app.route('/api/admin/jobs', jobRoutes);
app.route('/api/admin/ingest', ingestRoutes);
app.route('/api/generations', generationRoutes);
try { mkdirSync(localStorageRoot(), { recursive: true }); } catch { /* health remains available with incomplete env */ }
app.use('/uploads/*', serveStatic({ root: path.dirname(localStorageRoot()) }));

app.notFound((c) => fail(c, 'NOT_FOUND', 'Not found', 404));

function start() {
  // Soft: allow health without full env in CI; auth routes load env on demand
  try {
    loadEnv();
  } catch (err) {
    console.warn(
      '[api] env incomplete — health works; auth/db need .env:',
      err instanceof Error ? err.message : err,
    );
  }

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  });
}

start();

export default app;
