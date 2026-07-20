import { Hono } from 'hono';
import { ingestFlowTypeSchema } from '@promptix/shared';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import { listIngestSystemPrompts, saveIngestSystemPrompt } from '../lib/ingest-system-prompts.js';
import { fail, ok } from '../lib/response.js';

export const ingestRoutes = new Hono<AdminVars>();
ingestRoutes.use('*', requireAdmin);

ingestRoutes.get('/system-prompts', async (c) => ok(c, await listIngestSystemPrompts()));

ingestRoutes.put('/system-prompts/:flowType', async (c) => {
  const flow = ingestFlowTypeSchema.safeParse(c.req.param('flowType'));
  if (!flow.success) return fail(c, 'INVALID_INGEST_FLOW', 'Unknown ingest flow', 404);
  const body = await c.req.json().catch(() => null) as { prompt?: unknown } | null;
  try {
    const row = await saveIngestSystemPrompt(flow.data, body?.prompt, c.get('admin').sub);
    return ok(c, row);
  } catch (error) {
    return fail(c, 'INVALID_SYSTEM_PROMPT', error instanceof Error ? error.message : 'Invalid system prompt', 400);
  }
});
