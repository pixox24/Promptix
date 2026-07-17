# Split Ingest Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/admin/ingest` into independent text-optimization and image-reverse workflows with per-flow global system prompts, preserved async state, editable generated drafts, and deterministic prompt snapshots.

**Architecture:** Keep the existing `text_expand` and `image_reverse` job types and `TemplateDraft` contract. Add shared ingest prompt contracts, a two-row PostgreSQL configuration table, admin read/write endpoints, and API-side job prompt snapshotting; the Worker consumes the snapshot without rereading mutable configuration. Replace the coupled `Ingest` function with focused React components whose controllers remain mounted while the selected workspace changes.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle ORM/PostgreSQL, BullMQ, React 19, React Router, Node test runner, Tailwind CSS.

## Global Constraints

- Keep the route `/admin/ingest` and job types `text_expand` and `image_reverse` unchanged.
- The two workflows each own one global system prompt; prompts are not Provider- or Model-specific.
- System prompts trim surrounding whitespace and contain 1–20,000 characters.
- API snapshotting is authoritative: every new ingest job stores the effective prompt at `generation_jobs.input.systemPrompt` before enqueueing.
- The image-reverse configurable prompt affects final template structuring; the internal vision-description prompt remains fixed.
- Both workflow controllers stay mounted while the page is open; switching cards must not clear state or stop polling.
- Generated output must pass `templateDraftSchema` and remain editable before template creation.
- Saving creates a draft with `source` equal to the job type and `sourceMeta.jobId` equal to the source job ID, then navigates to the existing template editor.
- Do not add prompt history, per-model prompts, cancellation, refresh recovery, or unrelated Template Editor refactoring.
- Preserve all unrelated working-tree changes; stage only the files named by each task.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/index.ts` | Ingest flow schema, prompt validation, and code fallback defaults. |
| `packages/shared/test/contracts.test.mjs` | Shared contract regression coverage. |
| `apps/api/src/db/schema.ts` | `ingest_system_prompts` Drizzle schema. |
| `apps/api/drizzle/0003_ingest_system_prompts.sql` | Additive table creation and two-row seed. |
| `apps/api/drizzle/meta/0003_snapshot.json` | Drizzle schema snapshot generated with the migration. |
| `apps/api/drizzle/meta/_journal.json` | Migration journal entry. |
| `apps/api/test/ingest-migration-contract.test.mjs` | Migration safety and seed contract. |
| `apps/api/src/lib/ingest-system-prompts.ts` | Normalize, load, save, list, and resolve effective prompts. |
| `apps/api/src/routes/ingest.ts` | Admin GET/PUT endpoints for global prompts. |
| `apps/api/src/routes/jobs.ts` | Snapshot effective prompts into both ingest job inputs. |
| `apps/api/src/index.ts` | Mount the ingest admin routes. |
| `apps/api/test/ingest-system-prompts.test.mjs` | Prompt resolution and validation tests. |
| `apps/worker/src/ingest-job-input.ts` | Backward-compatible prompt fallback for ingest jobs. |
| `apps/worker/src/ai-adapters.ts` | Pass the effective prompt to the AI SDK `system` field. |
| `apps/worker/src/index.ts` | Preserve the snapshot through direct-vision and fallback paths. |
| `apps/worker/test/ingest-job-input.test.mjs` | Per-flow fallback and snapshot tests. |
| `apps/worker/test/deepseek-provider.test.mjs` | Request-level custom system prompt assertion. |
| `apps/web/src/types/ingest.ts` | Web-facing ingest job, prompt config, and workflow status types. |
| `apps/web/src/lib/ingest-workflow.ts` | Pure model filtering, status, prompt state, and draft parsing helpers. |
| `apps/web/src/hooks/useIngestJob.ts` | Polling lifecycle, transient connection errors, terminal state, and retry. |
| `apps/web/test/ingest-workflow.test.ts` | Pure web workflow behavior tests. |
| `apps/web/src/components/admin/ingest/IngestEntryCard.tsx` | Selectable entry card and background status summary. |
| `apps/web/src/components/admin/ingest/SystemPromptPanel.tsx` | Advanced prompt editor and global save/restore interactions. |
| `apps/web/src/components/admin/ingest/TemplateDraftReview.tsx` | Shared complete `TemplateDraft` editor and validation. |
| `apps/web/src/components/admin/ingest/TextOptimizeFlow.tsx` | Text workflow controller and submit payload. |
| `apps/web/src/components/admin/ingest/ImageReverseFlow.tsx` | Image workflow controller, preview, upload, and submit payload. |
| `apps/web/src/pages/admin/IngestPage.tsx` | Entry cards, active workspace, shared model/config loading. |
| `apps/web/src/pages/AdminPage.tsx` | Route the existing ingest path to `IngestPage` and remove the old coupled function. |
| `apps/web/test/ingest-page-layout.test.ts` | Source-level composition and always-mounted workflow contract. |

---

### Task 1: Add Shared Ingest Prompt Contracts

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/test/contracts.test.mjs`

**Interfaces:**
- Produces: `ingestFlowTypeSchema`, `IngestFlowType`, `ingestSystemPromptSchema`, and `DEFAULT_INGEST_SYSTEM_PROMPTS`.
- Consumed by: API persistence/routes, Worker fallback, and Web types.

- [ ] **Step 1: Write failing shared contract tests**

Add imports and this test to `packages/shared/test/contracts.test.mjs`:

```js
import {
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestFlowTypeSchema,
  ingestSystemPromptSchema,
} from '../dist/index.js';

test('ingest prompts are flow-specific and bounded', () => {
  assert.deepEqual(ingestFlowTypeSchema.options, ['text_expand', 'image_reverse']);
  assert.notEqual(
    DEFAULT_INGEST_SYSTEM_PROMPTS.text_expand,
    DEFAULT_INGEST_SYSTEM_PROMPTS.image_reverse,
  );
  assert.equal(
    ingestSystemPromptSchema.parse('  system instruction  '),
    'system instruction',
  );
  assert.equal(ingestSystemPromptSchema.safeParse('   ').success, false);
  assert.equal(ingestSystemPromptSchema.safeParse('x'.repeat(20_001)).success, false);
});
```

- [ ] **Step 2: Run the shared test and verify RED**

Run: `npm run test -w @promptix/shared`

Expected: FAIL because the four ingest exports do not exist.

- [ ] **Step 3: Add the minimal shared contracts**

Add after `TemplateDraft` in `packages/shared/src/index.ts`:

```ts
export const ingestFlowTypeSchema = z.enum(['text_expand', 'image_reverse']);
export type IngestFlowType = z.infer<typeof ingestFlowTypeSchema>;

export const ingestSystemPromptSchema = z.string().trim().min(1).max(20_000);

const TEMPLATE_DRAFT_RULES = [
  '只输出满足给定 schema 的数据。',
  '字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate。',
  'category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。',
  'variables 为 1-12 项，key 使用英文标识符，type 仅可为 text/select/number/ratio/image。',
  'promptTemplate 必须包含全部变量的 {{key}} 占位符。',
].join('');

export const DEFAULT_INGEST_SYSTEM_PROMPTS: Record<IngestFlowType, string> = {
  text_expand: `你是 Promptix 提示词优化与模板结构化引擎。请扩写用户需求并生成可复用的中文 AI 绘图提示词模板。${TEMPLATE_DRAFT_RULES}`,
  image_reverse: `你是 Promptix 图片反推与模板结构化引擎。请忠实保留参考图中的视觉事实，并生成可复用的中文 AI 绘图提示词模板。${TEMPLATE_DRAFT_RULES}`,
};
```

- [ ] **Step 4: Run shared build and tests**

Run: `npm run test -w @promptix/shared`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit shared contracts**

```bash
git add packages/shared/src/index.ts packages/shared/test/contracts.test.mjs
git commit -m "feat: define ingest prompt contracts"
```

---

### Task 2: Add the Global Prompt Table and Migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0003_ingest_system_prompts.sql`
- Create: `apps/api/drizzle/meta/0003_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/test/ingest-migration-contract.test.mjs`

**Interfaces:**
- Produces: Drizzle table `ingestSystemPrompts` with `flowType`, `prompt`, `updatedBy`, `createdAt`, and `updatedAt`.
- Consumes: the exact two flow keys and default prompt text from Task 1.

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/api/test/ingest-migration-contract.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle/0003_ingest_system_prompts.sql',
);

test('ingest prompt migration is additive and seeds both flows', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.match(migration, /CREATE TABLE "ingest_system_prompts"/);
  assert.match(migration, /CHECK \("flow_type" IN \('text_expand', 'image_reverse'\)\)/);
  assert.match(migration, /char_length\(btrim\("prompt"\)\) BETWEEN 1 AND 20000/);
  assert.match(migration, /'text_expand'/);
  assert.match(migration, /'image_reverse'/);
  assert.match(migration, /ON CONFLICT \("flow_type"\) DO NOTHING/);
});
```

- [ ] **Step 2: Run the focused API test and verify RED**

Run: `npm run build -w @promptix/api && node --test apps/api/test/ingest-migration-contract.test.mjs`

Expected: FAIL with `ENOENT` for `0003_ingest_system_prompts.sql`.

- [ ] **Step 3: Add the Drizzle table**

Import `check` from `drizzle-orm/pg-core`, then add to `apps/api/src/db/schema.ts`:

```ts
export const ingestSystemPrompts = pgTable(
  'ingest_system_prompts',
  {
    flowType: text('flow_type').primaryKey(),
    prompt: text('prompt').notNull(),
    updatedBy: uuid('updated_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'ingest_system_prompts_flow_type_check',
      sql`${t.flowType} in ('text_expand', 'image_reverse')`,
    ),
    check(
      'ingest_system_prompts_prompt_length_check',
      sql`char_length(btrim(${t.prompt})) between 1 and 20000`,
    ),
  ],
);
```

- [ ] **Step 4: Generate and normalize the migration**

Run:

```bash
npm run db:generate -w @promptix/api -- --name ingest_system_prompts
```

Rename the generated `0003_*.sql` to `apps/api/drizzle/0003_ingest_system_prompts.sql` if Drizzle adds a suffix. Ensure the journal tag is `0003_ingest_system_prompts`. Append these idempotent seed statements to the SQL, using the exact Task 1 strings:

```sql
INSERT INTO "ingest_system_prompts" ("flow_type", "prompt") VALUES
  ('text_expand', '你是 Promptix 提示词优化与模板结构化引擎。请扩写用户需求并生成可复用的中文 AI 绘图提示词模板。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate。category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅可为 text/select/number/ratio/image。promptTemplate 必须包含全部变量的 {{key}} 占位符。'),
  ('image_reverse', '你是 Promptix 图片反推与模板结构化引擎。请忠实保留参考图中的视觉事实，并生成可复用的中文 AI 绘图提示词模板。只输出满足给定 schema 的数据。字段必须包含 name、summary、description、category、tags、scenarios、variables、promptTemplate。category 仅可为 portrait/ecommerce/poster/logo/illustration/edit。variables 为 1-12 项，key 使用英文标识符，type 仅可为 text/select/number/ratio/image。promptTemplate 必须包含全部变量的 {{key}} 占位符。')
ON CONFLICT ("flow_type") DO NOTHING;
```

- [ ] **Step 5: Run migration contract and API build**

Run: `npm run build -w @promptix/api && node --test apps/api/test/ingest-migration-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0003_ingest_system_prompts.sql apps/api/drizzle/meta/0003_snapshot.json apps/api/drizzle/meta/_journal.json apps/api/test/ingest-migration-contract.test.mjs
git commit -m "feat: persist ingest system prompts"
```

---

### Task 3: Add Admin Prompt APIs and Job Snapshotting

**Files:**
- Create: `apps/api/src/lib/ingest-system-prompts.ts`
- Create: `apps/api/src/routes/ingest.ts`
- Modify: `apps/api/src/routes/jobs.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/test/ingest-system-prompts.test.mjs`

**Interfaces:**
- Produces: `normalizeIngestSystemPrompt(value)`, `effectiveIngestSystemPrompt(flow, override, configured)`, `loadIngestSystemPrompt(flow)`, and `saveIngestSystemPrompt(flow, prompt, adminId)`.
- HTTP: `GET /api/admin/ingest/system-prompts`; `PUT /api/admin/ingest/system-prompts/:flowType` with `{ prompt: string }`.
- Job input: both ingest routes persist an effective `systemPrompt` string before enqueue.

- [ ] **Step 1: Write failing prompt resolution tests**

Create `apps/api/test/ingest-system-prompts.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveIngestSystemPrompt,
  normalizeIngestSystemPrompt,
} from '../dist/lib/ingest-system-prompts.js';

test('normalizes valid prompts and rejects invalid values', () => {
  assert.equal(normalizeIngestSystemPrompt('  custom  '), 'custom');
  assert.throws(() => normalizeIngestSystemPrompt('  '), /System prompt/);
  assert.throws(() => normalizeIngestSystemPrompt('x'.repeat(20_001)), /System prompt/);
});

test('temporary override wins without changing configured fallback', () => {
  assert.equal(
    effectiveIngestSystemPrompt('text_expand', ' temporary ', 'configured'),
    'temporary',
  );
  assert.equal(
    effectiveIngestSystemPrompt('image_reverse', undefined, 'configured'),
    'configured',
  );
});
```

- [ ] **Step 2: Build and run the focused test to verify RED**

Run: `npm run build -w @promptix/api && node --test apps/api/test/ingest-system-prompts.test.mjs`

Expected: FAIL because `dist/lib/ingest-system-prompts.js` does not exist.

- [ ] **Step 3: Implement prompt normalization and persistence helpers**

Create `apps/api/src/lib/ingest-system-prompts.ts` with these public functions:

```ts
import {
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestSystemPromptSchema,
  type IngestFlowType,
} from '@promptix/shared';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { ingestSystemPrompts } from '../db/schema.js';

export function normalizeIngestSystemPrompt(value: unknown): string {
  const parsed = ingestSystemPromptSchema.safeParse(value);
  if (!parsed.success) throw new Error('System prompt must contain 1-20000 characters');
  return parsed.data;
}

export function effectiveIngestSystemPrompt(
  _flow: IngestFlowType,
  override: unknown,
  configured: string,
): string {
  return override === undefined
    ? normalizeIngestSystemPrompt(configured)
    : normalizeIngestSystemPrompt(override);
}

export async function loadIngestSystemPrompt(flow: IngestFlowType) {
  const [row] = await getDb().select().from(ingestSystemPrompts)
    .where(eq(ingestSystemPrompts.flowType, flow)).limit(1);
  return row?.prompt ?? DEFAULT_INGEST_SYSTEM_PROMPTS[flow];
}

export async function listIngestSystemPrompts() {
  const rows = await getDb().select().from(ingestSystemPrompts);
  const byFlow = new Map(rows.map((row) => [row.flowType, row]));
  return (['text_expand', 'image_reverse'] as const).map((flowType) => ({
    flowType,
    prompt: byFlow.get(flowType)?.prompt ?? DEFAULT_INGEST_SYSTEM_PROMPTS[flowType],
    updatedAt: byFlow.get(flowType)?.updatedAt ?? null,
  }));
}

export async function saveIngestSystemPrompt(
  flowType: IngestFlowType,
  prompt: unknown,
  adminId: string,
) {
  const normalized = normalizeIngestSystemPrompt(prompt);
  const [row] = await getDb().insert(ingestSystemPrompts).values({
    flowType, prompt: normalized, updatedBy: adminId,
  }).onConflictDoUpdate({
    target: ingestSystemPrompts.flowType,
    set: { prompt: normalized, updatedBy: adminId, updatedAt: new Date() },
  }).returning();
  return row;
}
```

- [ ] **Step 4: Add authenticated GET and PUT routes**

Create `apps/api/src/routes/ingest.ts`:

```ts
import { Hono } from 'hono';
import { ingestFlowTypeSchema } from '@promptix/shared';
import { requireAdmin, type AdminVars } from '../lib/auth.js';
import {
  listIngestSystemPrompts,
  saveIngestSystemPrompt,
} from '../lib/ingest-system-prompts.js';
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
```

Mount it in `apps/api/src/index.ts`:

```ts
import { ingestRoutes } from './routes/ingest.js';
app.route('/api/admin/ingest', ingestRoutes);
```

- [ ] **Step 5: Snapshot effective prompts in both job creation paths**

In `apps/api/src/routes/jobs.ts`, import `ingestFlowTypeSchema`, `effectiveIngestSystemPrompt`, and `loadIngestSystemPrompt`. Before inserting a `text_expand` row, compute:

```ts
let resolvedInput = parsed.data.input;
const ingestFlow = ingestFlowTypeSchema.safeParse(parsed.data.type);
if (ingestFlow.success) {
  try {
    const configured = await loadIngestSystemPrompt(ingestFlow.data);
    resolvedInput = {
      ...parsed.data.input,
      systemPrompt: effectiveIngestSystemPrompt(
        ingestFlow.data,
        parsed.data.input.systemPrompt,
        configured,
      ),
    };
  } catch (error) {
    return fail(c, 'INVALID_SYSTEM_PROMPT', error instanceof Error ? error.message : 'Invalid system prompt', 400);
  }
}
```

Use `input: resolvedInput` in the generic insert. In `/image-reverse`, read `body.systemPrompt`, resolve against `loadIngestSystemPrompt('image_reverse')` before inserting, and initialize the row with `{ systemPrompt }`. Preserve it when adding image metadata:

```ts
await db.update(generationJobs).set({
  input: { imageUrl: stored.url, objectKey: key, systemPrompt },
}).where(eq(generationJobs.id, row.id));
```

- [ ] **Step 6: Run API tests**

Run: `npm run test -w @promptix/api`

Expected: all API tests PASS.

- [ ] **Step 7: Commit API behavior**

```bash
git add apps/api/src/lib/ingest-system-prompts.ts apps/api/src/routes/ingest.ts apps/api/src/routes/jobs.ts apps/api/src/index.ts apps/api/test/ingest-system-prompts.test.mjs
git commit -m "feat: manage and snapshot ingest prompts"
```

---

### Task 4: Make the Worker Consume Prompt Snapshots

**Files:**
- Create: `apps/worker/src/ingest-job-input.ts`
- Modify: `apps/worker/src/ai-adapters.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/test/ingest-job-input.test.mjs`
- Modify: `apps/worker/test/deepseek-provider.test.mjs`

**Interfaces:**
- Produces: `effectiveIngestJobInput(jobType, input): Record<string, unknown>`.
- Consumes: Task 1 defaults and prompt schema; Task 3 stores snapshots.
- `structurePrompt` reads `input.systemPrompt` and supplies it as the AI SDK `system` field.

- [ ] **Step 1: Write failing Worker fallback tests**

Create `apps/worker/test/ingest-job-input.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_INGEST_SYSTEM_PROMPTS } from '@promptix/shared';
import { effectiveIngestJobInput } from '../dist/ingest-job-input.js';

test('preserves explicit ingest prompt snapshots', () => {
  assert.equal(
    effectiveIngestJobInput('text_expand', { text: 'hello', systemPrompt: ' custom ' }).systemPrompt,
    'custom',
  );
});

test('uses a flow-specific fallback for legacy ingest jobs', () => {
  assert.equal(
    effectiveIngestJobInput('text_expand', {}).systemPrompt,
    DEFAULT_INGEST_SYSTEM_PROMPTS.text_expand,
  );
  assert.equal(
    effectiveIngestJobInput('image_reverse', {}).systemPrompt,
    DEFAULT_INGEST_SYSTEM_PROMPTS.image_reverse,
  );
});
```

In the existing DeepSeek request test, pass `systemPrompt: 'CUSTOM SYSTEM'` and assert:

```js
assert.equal(body.messages[0].role, 'system');
assert.equal(body.messages[0].content, 'CUSTOM SYSTEM');
```

- [ ] **Step 2: Build and run focused Worker tests to verify RED**

Run:

```bash
npm run build -w @promptix/worker
node --test apps/worker/test/ingest-job-input.test.mjs apps/worker/test/deepseek-provider.test.mjs
```

Expected: FAIL because `effectiveIngestJobInput` is missing and `structurePrompt` still uses the hard-coded shared system string.

- [ ] **Step 3: Add the backward-compatible input resolver**

Create `apps/worker/src/ingest-job-input.ts`:

```ts
import {
  DEFAULT_INGEST_SYSTEM_PROMPTS,
  ingestFlowTypeSchema,
  ingestSystemPromptSchema,
} from '@promptix/shared';

export function effectiveIngestJobInput(
  jobType: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const flow = ingestFlowTypeSchema.safeParse(jobType);
  if (!flow.success) return input;
  const parsed = ingestSystemPromptSchema.safeParse(input.systemPrompt);
  return {
    ...input,
    systemPrompt: parsed.success
      ? parsed.data
      : DEFAULT_INGEST_SYSTEM_PROMPTS[flow.data],
  };
}
```

- [ ] **Step 4: Pass the prompt to the AI SDK**

In `apps/worker/src/ai-adapters.ts`, remove the old `SYSTEM` constant, import `DEFAULT_INGEST_SYSTEM_PROMPTS` and `ingestSystemPromptSchema`, and replace `system: SYSTEM` with:

```ts
const systemPrompt = ingestSystemPromptSchema.parse(
  input.systemPrompt ?? DEFAULT_INGEST_SYSTEM_PROMPTS.text_expand,
);

const common = {
  model: createLanguageModel(config),
  system: systemPrompt,
  output: Output.object({ schema: generatedDraftSchema }),
  maxRetries: 2,
  abortSignal: AbortSignal.timeout(120000),
  ...defaults.language,
};
```

- [ ] **Step 5: Preserve the snapshot through Worker branches**

In `apps/worker/src/index.ts`, compute once after parsing `jobType`:

```ts
const recordInput = effectiveIngestJobInput(
  jobType,
  record.input as Record<string, unknown>,
);
```

Use `recordInput` for direct text and direct image structuring. In the image fallback path pass both the vision description and the same snapshot:

```ts
output = await structurePrompt(primary, {
  text: `以下是视觉模型对参考图的详细描述。请保留视觉事实并优化为可复用模板：\n${description}`,
  systemPrompt: recordInput.systemPrompt,
});
```

- [ ] **Step 6: Run the full Worker test suite**

Run: `npm run test -w @promptix/worker`

Expected: all Worker tests PASS.

- [ ] **Step 7: Commit Worker snapshot support**

```bash
git add apps/worker/src/ingest-job-input.ts apps/worker/src/ai-adapters.ts apps/worker/src/index.ts apps/worker/test/ingest-job-input.test.mjs apps/worker/test/deepseek-provider.test.mjs
git commit -m "feat: apply ingest prompt snapshots in worker"
```

---

### Task 5: Add Web Workflow Types, Pure State Logic, and Polling Hook

**Files:**
- Create: `apps/web/src/types/ingest.ts`
- Create: `apps/web/src/lib/ingest-workflow.ts`
- Create: `apps/web/src/hooks/useIngestJob.ts`
- Create: `apps/web/test/ingest-workflow.test.ts`

**Interfaces:**
- Produces: `IngestJob`, `IngestPromptConfig`, `IngestFlowStatus`, `eligibleIngestModels`, `ingestFlowStatus`, `parseIngestDraft`, and `useIngestJob`.
- Consumed by: both workflow controllers, entry cards, and review form.

- [ ] **Step 1: Write failing pure workflow tests**

Create `apps/web/test/ingest-workflow.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleIngestModels, ingestFlowStatus, parseIngestDraft } from '../src/lib/ingest-workflow.ts';
import type { AdminModel } from '../src/types/adminModels.ts';

const model = (overrides: Partial<AdminModel> = {}): AdminModel => ({
  id: 'model', providerId: 'provider', providerName: 'Provider', providerEnabled: true,
  adapterType: 'openai_compatible', apiKeyConfigured: true, name: 'Model', modelId: 'model',
  capabilities: ['text', 'structured_output'], defaults: {}, enabled: true,
  isDefaultText: true, isDefaultVision: false, isDefaultImage: false, ...overrides,
});

test('filters ingest models to enabled structured text models', () => {
  assert.deepEqual(
    eligibleIngestModels([model(), model({ id: 'image', capabilities: ['image'] }), model({ id: 'off', enabled: false })]).map((item) => item.id),
    ['model'],
  );
});

test('maps asynchronous work to entry-card status', () => {
  assert.equal(ingestFlowStatus(undefined), 'idle');
  assert.equal(ingestFlowStatus({ status: 'queued' }), 'queued');
  assert.equal(ingestFlowStatus({ status: 'running' }), 'running');
  assert.equal(ingestFlowStatus({ status: 'succeeded', output: {} }), 'review');
  assert.equal(ingestFlowStatus({ status: 'failed' }), 'failed');
});

test('accepts only complete TemplateDraft job output', () => {
  assert.equal(parseIngestDraft({}).success, false);
  const result = parseIngestDraft({
    name: 'Draft', summary: 'Summary', description: 'Description', category: 'illustration',
    tags: [], scenarios: [], variables: [{ id: 'var-1', key: 'subject', label: 'Subject', type: 'text' }],
    promptTemplate: '{{subject}}',
  });
  assert.equal(result.success, true);
});
```

- [ ] **Step 2: Run Web tests and verify RED**

Run: `npm run test -w @promptix/web`

Expected: FAIL because `src/lib/ingest-workflow.ts` does not exist.

- [ ] **Step 3: Add Web types and pure helpers**

Create `apps/web/src/types/ingest.ts`:

```ts
import type { IngestFlowType, JobStatus, TemplateDraft } from '@promptix/shared';

export type IngestJob = {
  id: string;
  type: IngestFlowType;
  status: JobStatus;
  input: unknown;
  output?: TemplateDraft | null;
  errorMessage?: string | null;
  createdAt: string;
};

export type IngestPromptConfig = {
  flowType: IngestFlowType;
  prompt: string;
  updatedAt: string | null;
};

export type IngestFlowStatus = 'idle' | 'queued' | 'running' | 'review' | 'failed';
```

Create `apps/web/src/lib/ingest-workflow.ts`:

```ts
import { templateDraftSchema } from '@promptix/shared';
import type { AdminModel } from '../types/adminModels.ts';
import type { IngestFlowStatus } from '../types/ingest.ts';

export function eligibleIngestModels(models: AdminModel[]) {
  return models.filter((model) => model.enabled && model.providerEnabled &&
    model.capabilities.includes('text') && model.capabilities.includes('structured_output'));
}

export function ingestFlowStatus(job?: { status: string; output?: unknown }): IngestFlowStatus {
  if (!job) return 'idle';
  if (job.status === 'queued') return 'queued';
  if (job.status === 'running') return 'running';
  if (job.status === 'succeeded') return 'review';
  if (job.status === 'failed') return 'failed';
  return 'idle';
}

export function parseIngestDraft(output: unknown) {
  return templateDraftSchema.safeParse(output);
}
```

- [ ] **Step 4: Add the polling hook**

Create `apps/web/src/hooks/useIngestJob.ts` with this public shape:

```ts
export function useIngestJob() {
  const [job, setJob] = useState<IngestJob>();
  const [connectionError, setConnectionError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (timer.current !== undefined) window.clearInterval(timer.current);
    timer.current = undefined;
  }, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const next = await api<IngestJob>(`/api/admin/jobs/${id}`);
      setJob(next);
      setConnectionError('');
      if (['succeeded', 'failed', 'cancelled'].includes(next.status)) stop();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : '任务状态连接失败，正在重试');
    }
  }, [stop]);

  const track = useCallback((id: string) => {
    stop();
    void refresh(id);
    timer.current = window.setInterval(() => void refresh(id), 1500);
  }, [refresh, stop]);

  useEffect(() => stop, [stop]);

  const retry = useCallback(async () => {
    if (!job) return;
    await api(`/api/admin/jobs/${job.id}/retry`, { method: 'POST' });
    track(job.id);
  }, [job, track]);

  return { job, connectionError, track, retry };
}
```

Import `useCallback`, `useEffect`, `useRef`, and `useState` from React, plus `api` and `IngestJob`.

- [ ] **Step 5: Run Web tests and build**

Run: `npm run test -w @promptix/web && npm run build -w @promptix/web`

Expected: PASS.

- [ ] **Step 6: Commit Web state infrastructure**

```bash
git add apps/web/src/types/ingest.ts apps/web/src/lib/ingest-workflow.ts apps/web/src/hooks/useIngestJob.ts apps/web/test/ingest-workflow.test.ts
git commit -m "feat: add ingest workflow state model"
```

---

### Task 6: Build Shared Ingest Controls and Draft Review

**Files:**
- Create: `apps/web/src/components/admin/ingest/IngestEntryCard.tsx`
- Create: `apps/web/src/components/admin/ingest/SystemPromptPanel.tsx`
- Create: `apps/web/src/components/admin/ingest/TemplateDraftReview.tsx`
- Create: `apps/web/test/ingest-controls-layout.test.ts`

**Interfaces:**
- `IngestEntryCard({ active, title, description, status, onSelect })`.
- `SystemPromptPanel({ flowType, globalPrompt, value, onChange, onGlobalSaved })`.
- `TemplateDraftReview({ draft, source, jobId, onDraftChange, onSaved })`.

- [ ] **Step 1: Write a failing source composition test**

Create `apps/web/test/ingest-controls-layout.test.ts`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('system prompt controls distinguish temporary edits from global save', async () => {
  const source = await readFile(new URL('../src/components/admin/ingest/SystemPromptPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /仅本次修改/);
  assert.match(source, /恢复全局预设/);
  assert.match(source, /保存为系统提示词/);
  assert.match(source, /\/api\/admin\/ingest\/system-prompts\//);
});

test('draft review exposes every TemplateDraft field and source metadata', async () => {
  const source = await readFile(new URL('../src/components/admin/ingest/TemplateDraftReview.tsx', import.meta.url), 'utf8');
  for (const field of ['name', 'summary', 'description', 'category', 'tags', 'scenarios', 'variables', 'promptTemplate', 'negativePrompt']) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /sourceMeta:\s*\{\s*jobId\s*\}/);
  assert.match(source, /templateDraftSchema\.safeParse/);
});
```

- [ ] **Step 2: Run the focused Web test and verify RED**

Run: `npm run test -w @promptix/web`

Expected: FAIL with `ENOENT` for the new components.

- [ ] **Step 3: Implement the entry card**

`IngestEntryCard.tsx` must be a semantic button, expose `aria-pressed={active}`, render the mapped Chinese status label, and use the selected violet border/background only when active. Map status as:

```ts
const STATUS_LABEL: Record<IngestFlowStatus, string> = {
  idle: '未开始', queued: '排队中', running: '生成中', review: '待校对', failed: '失败',
};
```

- [ ] **Step 4: Implement the advanced system prompt panel**

`SystemPromptPanel.tsx` keeps only disclosure, save busy state, and save feedback locally. The parent owns `value` and `globalPrompt`. Save with:

```ts
const updated = await api<IngestPromptConfig>(
  `/api/admin/ingest/system-prompts/${flowType}`,
  { method: 'PUT', body: JSON.stringify({ prompt: value }) },
);
onGlobalSaved(updated.prompt);
```

Use `value.trim() !== globalPrompt.trim()` for the “仅本次修改” state. Disable global save for blank, over 20,000 characters, unchanged content, or an active request. “恢复全局预设” calls `onChange(globalPrompt)`.

- [ ] **Step 5: Implement the complete draft review form**

`TemplateDraftReview.tsx` owns save busy/error state but receives and updates the draft from its flow controller. It must:

- Render text inputs for `name`, `summary`, `description`, `tags`, and `scenarios`.
- Render the six category options from `templateCategorySchema.options`.
- Render add/update/remove controls for variables including `key`, `label`, `type`, `placeholder`, `defaultValue`, `required`, and comma-separated `options` for `select`.
- Render textareas for `promptTemplate` and `negativePrompt`.
- Run `templateDraftSchema.safeParse(draft)` before save and list issue messages next to the relevant section.
- POST this exact payload:

```ts
const parsed = templateDraftSchema.safeParse(draft);
if (!parsed.success) return setIssues(parsed.error.issues);
const template = await api<{ id: string }>('/api/admin/templates', {
  method: 'POST',
  body: JSON.stringify({
    ...parsed.data,
    source,
    sourceMeta: { jobId },
  }),
});
onSaved(template.id);
```

- [ ] **Step 6: Run control tests and Web build**

Run: `npm run test -w @promptix/web && npm run build -w @promptix/web`

Expected: PASS.

- [ ] **Step 7: Commit shared ingest controls**

```bash
git add apps/web/src/components/admin/ingest/IngestEntryCard.tsx apps/web/src/components/admin/ingest/SystemPromptPanel.tsx apps/web/src/components/admin/ingest/TemplateDraftReview.tsx apps/web/test/ingest-controls-layout.test.ts
git commit -m "feat: add ingest prompt and draft controls"
```

---

### Task 7: Assemble Independent Text and Image Workflows

**Files:**
- Create: `apps/web/src/components/admin/ingest/TextOptimizeFlow.tsx`
- Create: `apps/web/src/components/admin/ingest/ImageReverseFlow.tsx`
- Create: `apps/web/src/pages/admin/IngestPage.tsx`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Create: `apps/web/test/ingest-page-layout.test.ts`

**Interfaces:**
- Both flow components receive `models`, `globalPrompt`, `onGlobalPromptSaved`, and `onStatusChange`.
- `IngestPage` loads models/configs once, keeps both flow components mounted, and changes only `hidden`/visibility.
- Both flows use `useIngestJob`, `SystemPromptPanel`, and `TemplateDraftReview`.

- [ ] **Step 1: Write the failing page composition test**

Create `apps/web/test/ingest-page-layout.test.ts`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps both ingest controllers mounted behind entry-card visibility', async () => {
  const source = await readFile(new URL('../src/pages/admin/IngestPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /提示词优化/);
  assert.match(source, /图片反推/);
  assert.match(source, /<TextOptimizeFlow/);
  assert.match(source, /<ImageReverseFlow/);
  assert.match(source, /hidden=\{activeFlow !== 'text_expand'\}/);
  assert.match(source, /hidden=\{activeFlow !== 'image_reverse'\}/);
});

test('admin route uses the extracted ingest page', async () => {
  const source = await readFile(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ IngestPage \}/);
  assert.match(source, /path="ingest" element=\{<IngestPage\/>\}/);
  assert.doesNotMatch(source, /function Ingest\(/);
});
```

- [ ] **Step 2: Run the focused layout test and verify RED**

Run: `npm run test -w @promptix/web`

Expected: FAIL because `IngestPage.tsx` does not exist and `AdminPage.tsx` still defines `Ingest`.

- [ ] **Step 3: Implement `TextOptimizeFlow`**

The component owns `text`, `modelId`, `systemPrompt`, `globalPrompt`, `draft`, and message state. Initialize the selected model to the enabled default text model, otherwise the first eligible model. Submit exactly:

```ts
const response = await api<{ jobId: string }>('/api/admin/jobs', {
  method: 'POST',
  body: JSON.stringify({
    type: 'text_expand',
    modelId: modelId || undefined,
    input: { text, systemPrompt },
  }),
});
track(response.jobId);
```

Disable submit when text is blank, prompt is invalid, or the current job is queued/running. When a succeeded job arrives, call `parseIngestDraft(job.output)` once and initialize editable draft state. On failed jobs show `job.errorMessage` and a retry button. On save call `navigate('/admin/templates/' + id)`.

- [ ] **Step 4: Implement `ImageReverseFlow`**

The component owns `file`, object URL preview, `modelId`, `systemPrompt`, `globalPrompt`, `draft`, and message state. Revoke the previous object URL on replacement/unmount. Submit exactly:

```ts
const body = new FormData();
body.set('file', file);
body.set('systemPrompt', systemPrompt);
if (modelId) body.set('modelId', modelId);
const response = await api<{ jobId: string }>('/api/admin/jobs/image-reverse', {
  method: 'POST', body,
});
track(response.jobId);
```

Accept only `image/*`, reject files over 10 MB before submission, render a preview and replacement control, and apply the same job/draft/save behavior as the text flow.

- [ ] **Step 5: Implement `IngestPage` with always-mounted flows**

Load these resources in one `Promise.all` on mount:

```ts
const [allModels, promptConfigs] = await Promise.all([
  api<AdminModel[]>('/api/admin/models?capability=text'),
  api<IngestPromptConfig[]>('/api/admin/ingest/system-prompts'),
]);
```

Filter with `eligibleIngestModels`. Keep `activeFlow` plus one `IngestFlowStatus` per flow. Render two `IngestEntryCard`s and both flow components:

```tsx
<section hidden={activeFlow !== 'text_expand'}>
  <TextOptimizeFlow models={models} globalPrompt={prompts.text_expand}
    onGlobalPromptSaved={(prompt) => setPrompts((value) => ({ ...value, text_expand: prompt }))}
    onStatusChange={(status) => setStatuses((value) => ({ ...value, text_expand: status }))} />
</section>
<section hidden={activeFlow !== 'image_reverse'}>
  <ImageReverseFlow models={models} globalPrompt={prompts.image_reverse}
    onGlobalPromptSaved={(prompt) => setPrompts((value) => ({ ...value, image_reverse: prompt }))}
    onStatusChange={(status) => setStatuses((value) => ({ ...value, image_reverse: status }))} />
</section>
```

When a child saves a new global prompt, update the parent prompt map so returning to either flow uses the latest global value.

- [ ] **Step 6: Replace the old route implementation**

In `apps/web/src/pages/AdminPage.tsx`:

- Import `IngestPage` from `./admin/IngestPage`.
- Replace `<Route path="ingest" element={<Ingest/>}/>` with `<Route path="ingest" element={<IngestPage/>}/>`.
- Delete only the old `function Ingest()` block.
- Remove imports/types that became unused because of this deletion; keep Template Editor and Jobs behavior unchanged.

- [ ] **Step 7: Run Web tests, lint, and build**

Run:

```bash
npm run test -w @promptix/web
npm run lint -w @promptix/web
npm run build -w @promptix/web
```

Expected: all commands PASS with zero errors.

- [ ] **Step 8: Commit the independent workflows**

```bash
git add apps/web/src/components/admin/ingest/TextOptimizeFlow.tsx apps/web/src/components/admin/ingest/ImageReverseFlow.tsx apps/web/src/pages/admin/IngestPage.tsx apps/web/src/pages/AdminPage.tsx apps/web/test/ingest-page-layout.test.ts
git commit -m "feat: split intelligent ingest workflows"
```

---

### Task 8: Migrate, Verify Both Live Flows, and Document Operations

**Files:**
- Modify: `docs/ops.md`
- Modify only if verification reveals a scoped defect: files from Tasks 1–7 and their tests.

**Interfaces:**
- Consumes all prior tasks.
- Produces an applied local migration, green repository checks, and a short operator runbook.

- [ ] **Step 1: Document the prompt configuration and migration**

Add to `docs/ops.md`:

```md
## 智能入库系统提示词

- `/admin/ingest` 为提示词优化和图片反推分别维护一份全局系统提示词。
- 管理员可在流程的“高级设置”中临时覆盖；“保存为系统提示词”会更新后续任务的全局默认值。
- 任务创建时会把最终提示词快照写入 `generation_jobs.input.systemPrompt`；重试沿用原快照。
- 部署包含 `ingest_system_prompts` 迁移时，先执行 `npm run db:migrate`，再同时重启 API 和 Worker。
```

- [ ] **Step 2: Apply the migration locally**

Run: `npm run db:migrate`

Expected: migration `0003_ingest_system_prompts` applies successfully and a second run reports no pending migration.

- [ ] **Step 3: Run all automated checks from a clean command invocation**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all shared, API, Worker, and Web checks PASS.

- [ ] **Step 4: Verify live prompt configuration**

With API, Worker, and Web running:

1. Open `/admin/ingest` and confirm two entry cards appear.
2. Change the text workflow prompt temporarily, submit, and verify the global value is unchanged after reload.
3. Save a new image-reverse global prompt, reload, and verify only image reverse changed.
4. Inspect the created `generation_jobs.input.systemPrompt` values and confirm each job contains its submission-time snapshot.

- [ ] **Step 5: Verify independent async state and draft save**

1. Submit one text job and immediately switch to image reverse.
2. Submit one image job while text remains queued/running.
3. Switch repeatedly and confirm both statuses continue updating.
4. Edit every section of each generated draft.
5. Save each draft and confirm navigation to `/admin/templates/:id`.
6. Confirm each template has the correct `source` and `sourceMeta.jobId`.

- [ ] **Step 6: Commit operational documentation and any verified scoped fixes**

```bash
git add docs/ops.md
git commit -m "docs: explain ingest prompt operations"
```

Do not stage unrelated working-tree files. If a verification fix was necessary, stage its named production file and matching regression test in a separate focused commit before the documentation commit.

---

## Final Verification Checklist

- [ ] The migration is additive, seeded, and idempotent.
- [ ] Both API routes require admin authentication.
- [ ] New jobs always contain `input.systemPrompt`; legacy jobs have Worker fallbacks.
- [ ] Image vision fallback preserves the same image-reverse prompt snapshot for final structuring.
- [ ] Both flow controllers stay mounted and poll independently.
- [ ] Prompt save/restore/temporary states match the approved wording.
- [ ] Draft review exposes and validates every `TemplateDraft` field.
- [ ] Template save writes `source` and `sourceMeta.jobId`, then navigates to the editor.
- [ ] `npm run test`, `npm run lint`, and `npm run build` pass from fresh commands.
- [ ] Only feature files and explicitly requested documentation are committed.
