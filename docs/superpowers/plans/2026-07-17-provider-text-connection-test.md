# Provider Text Connection Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add an admin-only, low-cost Provider connection test that submits an explicit text Model to the existing Worker and reports a safe, auditable result.

**Architecture:** The Provider route validates and enqueues a new provider_test generation job; it never calls a model directly. The Worker resolves the explicit Model using its existing factory, makes one fixed 16-token text request, and stores only timing and configuration identifiers. The Provider page presents model selection and polls the existing job endpoint.

**Tech Stack:** React 19 + TypeScript + Vite, Hono, Drizzle/PostgreSQL, BullMQ, AI SDK 7, Node.js built-in test runner, Zod.

## Global Constraints

- All test routes remain admin-only and never accept, persist, or render a provider secret.
- The test prompt is fixed to Reply with OK only; user data is never sent.
- Every test request uses temperature 0, maxOutputTokens 16, one upstream attempt, and a 30-second timeout.
- A test is valid only for an enabled Provider and an enabled, Provider-owned Model with the text capability.
- Test output contains only ok, Provider ID, Model ID, latency, and timestamp; never response text, headers, raw payloads, or API keys.
- The test runs through promptix-jobs, so a Worker or Worker-environment failure remains visible.

---

## File structure

| File | Responsibility |
|---|---|
| packages/shared/src/index.ts | Declares provider_test and the safe successful test-result schema. |
| packages/shared/test/contracts.test.mjs | Locks the new job type and result contract. |
| apps/api/src/lib/job-enqueue.ts | Owns the reusable stored-job transition and BullMQ enqueue operation, including an explicit per-job attempt override. |
| apps/api/src/lib/provider-text-test.ts | Pure Provider/Model/key validation and error-code metadata. |
| apps/api/src/routes/jobs.ts | Uses the shared enqueue helper and blocks generic provider_test creation. |
| apps/api/src/routes/providers.ts | Adds POST /:providerId/test, persists provider_test, and returns 202. |
| apps/api/test/provider-text-test.test.mjs | Verifies pure validation precedence and error-code mapping. |
| apps/worker/src/provider-text-test.ts | Executes and sanitizes the bounded text call. |
| apps/worker/src/index.ts | Dispatches provider_test to the executor. |
| apps/worker/src/model-routing.ts | Requires text, but not structured_output, for provider_test. |
| apps/worker/test/provider-text-test.test.mjs | Verifies request bounds, safe output, and error redaction. |
| apps/web/src/pages/admin/ProviderModelsPage.tsx | Adds model selection, polling, feedback, and Task Center link. |
| apps/web/src/types/adminModels.ts | Adds narrowly scoped Provider-test job/result types. |
| apps/web/src/lib/provider-text-test-ui.ts | Keeps model eligibility, default selection, and terminal-state rules testable outside React. |
| apps/web/test/provider-text-test-ui.test.ts | Verifies the Provider-page selection and pending-state rules with Node's test runner. |
| apps/web/package.json | Exposes the TypeScript Node test command. |
| package.json | Runs the Web unit test workspace in the root regression suite. |
| docs/ops.md | Documents the operator workflow and diagnostics. |

---

### Task 1: Add the shared provider_test contract and routing rules

**Files:**
- Modify: packages/shared/src/index.ts:83-90
- Modify: packages/shared/test/contracts.test.mjs
- Modify: apps/api/src/lib/job-model-selection.ts:12-41
- Modify: apps/api/test/job-model-selection.test.mjs
- Modify: apps/worker/src/model-routing.ts:8-49
- Modify: apps/worker/test/model-routing.test.mjs

**Interfaces:**
- Produces JobType including provider_test.
- Produces providerTextTestResultSchema, parsing { ok: true, providerId, modelId, latencyMs, checkedAt }.
- defaultRoleForJob('provider_test') and roleForJob('provider_test') return 'text'.
- requiredCapabilitiesForJob('provider_test') returns ['text']; structured output is deliberately not required.

- [ ] **Step 1: Write the failing shared-contract and routing tests.**

  Append these assertions before production changes:

  ~~~js
  test('provider test is a bounded text-only job type', () => {
    assert.equal(jobTypeSchema.safeParse('provider_test').success, true);
    assert.equal(providerTextTestResultSchema.safeParse({
      ok: true,
      providerId: '00000000-0000-4000-8000-000000000001',
      modelId: '00000000-0000-4000-8000-000000000002',
      latencyMs: 23,
      checkedAt: '2026-07-17T00:00:00.000Z',
    }).success, true);
    assert.equal(providerTextTestResultSchema.safeParse({ ok: true }).success, false);
  });

  assert.equal(defaultRoleForJob('provider_test'), 'text');
  assert.deepEqual(requiredCapabilitiesForJob('provider_test'), ['text']);
  assert.equal(roleForJob('provider_test'), 'text');
  assert.doesNotThrow(() => assertCapabilitiesForJob(
    model({ capabilities: ['text'] }), 'provider_test',
  ));
  ~~~

- [ ] **Step 2: Run the focused tests and confirm they fail because the contract is absent.**

  Run:

  ~~~powershell
  npm run build -w @promptix/shared
  node --test packages/shared/test/contracts.test.mjs
  npm run build -w @promptix/api
  node --test apps/api/test/job-model-selection.test.mjs
  npm run build -w @promptix/worker
  node --test apps/worker/test/model-routing.test.mjs
  ~~~

  Expected: the added test cannot import the result schema or parse provider_test.

- [ ] **Step 3: Add the smallest shared contract and exhaustive switch cases.**

  In packages/shared/src/index.ts, extend the enum and export the result schema:

  ~~~ts
  export const jobTypeSchema = z.enum([
    'noop', 'image_reverse', 'text_expand', 'image_generate', 'structure', 'provider_test',
  ]);

  export const providerTextTestResultSchema = z.object({
    ok: z.literal(true),
    providerId: z.string().uuid(),
    modelId: z.string().uuid(),
    latencyMs: z.number().int().nonnegative(),
    checkedAt: z.string().datetime(),
  });
  export type ProviderTextTestResult = z.infer<typeof providerTextTestResultSchema>;
  ~~~

  Add provider_test => text to both role switches. Add provider_test => ['text'] to the API required-capability switch. In the Worker capability assertion, add a distinct provider_test branch:

  ~~~ts
  if (jobType === 'provider_test' && !capabilities.has('text')) {
    throw new Error('Model ' + model.name + ' lacks text capability');
  }
  ~~~

  Preserve the existing text_expand, structure, and image_reverse requirement for both text and structured_output.

- [ ] **Step 4: Re-run the focused tests and verify builds compile.**

  Run the commands from Step 2.

  Expected: all three test files pass and each workspace build exits 0.

- [ ] **Step 5: Commit the shared contract and routing behavior.**

  ~~~powershell
  git add packages/shared/src/index.ts packages/shared/test/contracts.test.mjs apps/api/src/lib/job-model-selection.ts apps/api/test/job-model-selection.test.mjs apps/worker/src/model-routing.ts apps/worker/test/model-routing.test.mjs
  git commit -m "feat: add provider text test job contract"
  ~~~

### Task 2: Implement the bounded Worker text-test executor

**Files:**
- Create: apps/worker/src/provider-text-test.ts
- Modify: apps/worker/src/index.ts:1-71
- Create: apps/worker/test/provider-text-test.test.mjs

**Interfaces:**
- Consumes ResolvedModel and providerTextTestResultSchema from Task 1.
- Produces runProviderTextTest(config, invoke?), resolving to ProviderTextTestResult.
- Produces ProviderTextTestError, whose message is safe to store in generation_jobs.errorMessage.
- The Worker calls runProviderTextTest(primary) only for provider_test.

- [ ] **Step 1: Write failing executor tests using an injected text invoker.**

  Create apps/worker/test/provider-text-test.test.mjs. Reuse the Provider and Model fixtures from model-factory.test.mjs, set TEST_MODEL_FACTORY_KEY, and use:

  ~~~js
  const baseProvider = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Example', adapterType: 'openai_compatible', baseUrl: 'https://example.invalid/v1',
    apiKeyEnv: 'TEST_MODEL_FACTORY_KEY', authStyle: 'bearer', enabled: true,
    protocol: 'openai_chat', kind: 'llm', defaultModel: '', defaults: {}, isDefault: false,
  };
  const baseModel = {
    id: '00000000-0000-4000-8000-000000000002', providerId: baseProvider.id,
    name: 'Example model', modelId: 'example-model', capabilities: ['text'], defaults: {},
    enabled: true, isDefaultText: true, isDefaultVision: false, isDefaultImage: false,
  };
  const config = { provider: baseProvider, model: baseModel };

  test('uses a fixed minimal text request and stores no generated text', async () => {
    let request;
    const output = await runProviderTextTest(
      { provider: baseProvider, model: { ...baseModel, capabilities: ['text'] } },
      async (value) => { request = value; return { text: 'OK' }; },
    );
    assert.equal(request.prompt, 'Reply with OK only');
    assert.equal(request.temperature, 0);
    assert.equal(request.maxOutputTokens, 16);
    assert.equal(request.maxRetries, 0);
    assert.deepEqual(Object.keys(output).sort(), [
      'checkedAt', 'latencyMs', 'modelId', 'ok', 'providerId',
    ]);
  });

  test('redacts authentication material in an upstream failure', async () => {
    await assert.rejects(
      () => runProviderTextTest(config, async () => {
        throw new Error('401 Authorization: Bearer secret-token');
      }),
      (error) => error.message.includes('authentication failed') &&
        !error.message.includes('secret-token'),
    );
  });
  ~~~

- [ ] **Step 2: Run the focused Worker test and confirm the module is missing.**

  ~~~powershell
  npm run build -w @promptix/worker
  node --test apps/worker/test/provider-text-test.test.mjs
  ~~~

  Expected: ERR_MODULE_NOT_FOUND for dist/provider-text-test.js.

- [ ] **Step 3: Implement the one-call executor and sanitized errors.**

  Use the existing createLanguageModel factory and AI SDK generateText. The executor must not carry model text into its return value:

  ~~~ts
  export const PROVIDER_TEST_PROMPT = 'Reply with OK only';

  export class ProviderTextTestError extends Error {}

  export async function runProviderTextTest(
    config: ResolvedModel,
    invoke: typeof generateText = generateText,
  ): Promise<ProviderTextTestResult> {
    const startedAt = performance.now();
    try {
      await invoke({
        model: createLanguageModel(config),
        prompt: PROVIDER_TEST_PROMPT,
        temperature: 0,
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30_000),
      });
      return providerTextTestResultSchema.parse({
        ok: true,
        providerId: config.provider.id,
        modelId: config.model.id,
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      throw new ProviderTextTestError(normalizeProviderTextTestError(error));
    }
  }
  ~~~

  normalizeProviderTextTestError must map 401/403 to Provider authentication failed, 404 to Provider endpoint or model was not found, 429 to Provider rate limit reached, and timeout/network failures to Provider request timed out or could not reach the endpoint. For unknown cases, remove Authorization: Bearer tokens, X-API-Key tokens, and JSON api_key/apiKey values, truncate to 240 characters, and prefix Provider test failed:.

  In apps/worker/src/index.ts, dispatch before the existing structured fallback:

  ~~~ts
  if (jobType === 'provider_test') {
    output = await runProviderTextTest(primary);
  } else if (jobType === 'image_generate') {
    output = await generateImage(primary, record.input as Record<string, unknown>);
  }
  ~~~

- [ ] **Step 4: Run Worker tests and verify all existing tasks remain covered.**

  ~~~powershell
  npm run test -w @promptix/worker
  ~~~

  Expected: build succeeds and every Worker test passes.

- [ ] **Step 5: Commit the Worker executor.**

  ~~~powershell
  git add apps/worker/src/provider-text-test.ts apps/worker/src/index.ts apps/worker/test/provider-text-test.test.mjs
  git commit -m "feat: run provider tests through worker"
  ~~~

### Task 3: Add Provider validation, stored-job creation, and reusable enqueueing

**Files:**
- Create: apps/api/src/lib/job-enqueue.ts
- Create: apps/api/src/lib/provider-text-test.ts
- Modify: apps/api/src/routes/jobs.ts:1-174
- Modify: apps/api/src/routes/providers.ts:1-132
- Create: apps/api/test/provider-text-test.test.mjs

**Interfaces:**
- Produces enqueueGenerationJob(jobId: string, options?: { attempts?: number }): Promise<void>, the only API helper that marks a stored job queued and sends it to BullMQ.
- Produces providerTextTestProblem(provider, model, env), returning null or one stable validation code.
- Produces POST /api/admin/providers/:providerId/test accepting { modelId: uuid } and returning { jobId, status: 'queued' } with 202.

- [ ] **Step 1: Write failing pure validation tests.**

  Add apps/api/test/provider-text-test.test.mjs using plain objects and no database:

  ~~~js
  const enabledProvider = { id: 'provider-a', enabled: true, apiKeyEnv: 'TEST_KEY' };
  const textModel = {
    id: 'model-a', providerId: 'provider-a', enabled: true, capabilities: ['text'],
  };

  test('requires an enabled Provider-owned text Model and configured API key', () => {
    assert.equal(providerTextTestProblem(enabledProvider, textModel, { TEST_KEY: 'set' }), null);
    assert.equal(providerTextTestProblem(
      { ...enabledProvider, enabled: false }, textModel, { TEST_KEY: 'set' },
    ), 'PROVIDER_DISABLED');
    assert.equal(providerTextTestProblem(enabledProvider, textModel, {}),
      'PROVIDER_KEY_NOT_CONFIGURED');
    assert.equal(providerTextTestProblem(enabledProvider, null, { TEST_KEY: 'set' }),
      'MODEL_NOT_FOUND');
    assert.equal(providerTextTestProblem(
      enabledProvider, { ...textModel, providerId: 'other' }, { TEST_KEY: 'set' },
    ), 'MODEL_PROVIDER_MISMATCH');
    assert.equal(providerTextTestProblem(
      enabledProvider, { ...textModel, enabled: false }, { TEST_KEY: 'set' },
    ), 'MODEL_DISABLED');
    assert.equal(providerTextTestProblem(
      enabledProvider, { ...textModel, capabilities: ['image'] }, { TEST_KEY: 'set' },
    ), 'MODEL_CAPABILITY_MISMATCH');
  });
  ~~~

- [ ] **Step 2: Run the API test and confirm the validation module is missing.**

  ~~~powershell
  npm run build -w @promptix/api
  node --test apps/api/test/provider-text-test.test.mjs
  ~~~

  Expected: ERR_MODULE_NOT_FOUND for dist/lib/provider-text-test.js.

- [ ] **Step 3: Extract enqueueing and implement validation.**

  Move the exact local enqueue body from routes/jobs.ts into lib/job-enqueue.ts as enqueueGenerationJob. It accepts an optional attempts override: ordinary jobs continue to use loadEnv().JOB_ATTEMPTS, while a Provider test passes 1. Preserve QUEUE_NAME, exponential backoff, explicit Bull job ID, removeOnComplete 100, and removeOnFail 500.

  In lib/provider-text-test.ts, return the first applicable condition in this order: disabled Provider, absent API-process key, missing Model, wrong Provider ownership, disabled Model, absent text capability. Export this exact response map:

  ~~~ts
  export const providerTextTestProblemResponse = {
    PROVIDER_DISABLED: { status: 409, message: 'Enable the provider before testing it' },
    PROVIDER_KEY_NOT_CONFIGURED: {
      status: 409,
      message: 'The provider key is not configured in the API environment',
    },
    MODEL_NOT_FOUND: { status: 404, message: 'Model not found' },
    MODEL_PROVIDER_MISMATCH: {
      status: 409,
      message: 'The selected model does not belong to this provider',
    },
    MODEL_DISABLED: { status: 409, message: 'Enable the model before testing it' },
    MODEL_CAPABILITY_MISMATCH: {
      status: 409,
      message: 'The selected model does not support text',
    },
  } as const;
  ~~~

- [ ] **Step 4: Add the Provider endpoint and block generic test-job creation.**

  In providerRoutes, parse { modelId: z.string().uuid() }, load Provider by URL ID and Model by body ID, run providerTextTestProblem, and insert:

  ~~~ts
  const [job] = await getDb().insert(generationJobs).values({
    type: 'provider_test',
    status: 'pending',
    actorId: c.get('admin').sub,
    providerId: provider.id,
    modelId: model.id,
    input: {},
  }).returning();
  ~~~

  Call enqueueGenerationJob(job.id, { attempts: 1 }). This prevents automatic BullMQ retry and therefore guarantees at most one upstream provider call per submitted connection test. On an enqueue failure, retain existing Queue unavailable behavior: persist failed, set finishedAt, and return QUEUE_UNAVAILABLE with HTTP 503. On success return ok(c, { jobId: job.id, status: 'queued' }, 202).

  Replace every local enqueue call in routes/jobs.ts with enqueueGenerationJob. Immediately after generic job parsing, reject provider_test with TEST_ROUTE_REQUIRED, HTTP 400, and Use the provider test endpoint to create provider_test jobs. This prevents an unscoped default-model test.

- [ ] **Step 5: Run API tests.**

  ~~~powershell
  npm run test -w @promptix/api
  ~~~

  Expected: API build succeeds, existing tests pass, and the validation test proves every stable code.

- [ ] **Step 6: Commit the API endpoint.**

  ~~~powershell
  git add apps/api/src/lib/job-enqueue.ts apps/api/src/lib/provider-text-test.ts apps/api/src/routes/jobs.ts apps/api/src/routes/providers.ts apps/api/test/provider-text-test.test.mjs
  git commit -m "feat: enqueue provider text connection tests"
  ~~~

### Task 4: Add Provider-page model selection, polling, and safe status feedback

**Files:**
- Modify: apps/web/src/types/adminModels.ts
- Modify: apps/web/src/pages/admin/ProviderModelsPage.tsx:1-304
- Create: apps/web/src/lib/provider-text-test-ui.ts
- Create: apps/web/test/provider-text-test-ui.test.ts
- Modify: apps/web/package.json
- Modify: package.json

**Interfaces:**
- Consumes POST /api/admin/providers/:providerId/test and GET /api/admin/jobs/:jobId from Task 3.
- Defines ProviderTextTestJob with id, status, modelId, safe output, and optional errorMessage.
- Renders a selector containing only enabled, Provider-owned Models with text capability.
- Produces eligibleProviderTextModels, initialProviderTextTestModelId, and isProviderTextTestPending for direct unit tests.

- [ ] **Step 1: Write failing Web selection and pending-state tests.**

  Create apps/web/test/provider-text-test-ui.test.ts and test the pure UI helper rather than asserting implementation details of the React component:

  ~~~ts
  import test from 'node:test';
  import assert from 'node:assert/strict';
  import {
    eligibleProviderTextModels,
    initialProviderTextTestModelId,
    isProviderTextTestPending,
  } from '../src/lib/provider-text-test-ui.ts';
  import type { AdminModel, ProviderConnection } from '../src/types/adminModels.ts';

  const provider: ProviderConnection = {
    id: 'provider-a', name: 'Provider A', adapterType: 'openai_compatible',
    baseUrl: 'https://example.invalid/v1', apiKeyConfigured: true,
    authStyle: 'bearer' as const, enabled: true,
  };
  const defaultText: AdminModel = {
    id: 'default-text', providerId: 'provider-a', providerName: 'Provider A',
    providerEnabled: true, adapterType: 'openai_compatible', apiKeyConfigured: true,
    name: 'Text', modelId: 'text-1', capabilities: ['text'], defaults: {},
    enabled: true, isDefaultText: true, isDefaultVision: false, isDefaultImage: false,
  };
  const imageOnly: AdminModel = { ...defaultText, id: 'image-only', capabilities: ['image'] };
  const disabledText = { ...defaultText, id: 'disabled-text', enabled: false };
  const otherProvider = { ...defaultText, id: 'other-provider', providerId: 'provider-b' };

  test('only exposes enabled text models owned by the Provider', () => {
    const eligible = eligibleProviderTextModels(provider, [defaultText, imageOnly, disabledText, otherProvider]);
    assert.deepEqual(eligible.map((model) => model.id), ['default-text']);
    assert.equal(initialProviderTextTestModelId(eligible), 'default-text');
  });

  test('treats queued and running jobs as non-dismissible pending work', () => {
    assert.equal(isProviderTextTestPending('queued'), true);
    assert.equal(isProviderTextTestPending('running'), true);
    assert.equal(isProviderTextTestPending('succeeded'), false);
    assert.equal(isProviderTextTestPending('failed'), false);
  });
  ~~~

  Add the Web script and root-suite call without adding any package: tsx is already a locked workspace development dependency of the API and Worker packages.

  ~~~json
  // apps/web/package.json
  {
    "scripts": {
      "dev": "vite",
      "build": "tsc -b && vite build",
      "lint": "oxlint",
      "preview": "vite preview",
      "test": "node --import tsx --test test/*.test.ts"
    }
  }

  // package.json
  {
    "scripts": {
      "test": "npm run test -w @promptix/shared && npm run test -w @promptix/api && npm run test -w @promptix/worker && npm run test -w @promptix/web"
    }
  }
  ~~~

- [ ] **Step 2: Run the focused Web test and confirm the helper module is missing.**

  ~~~powershell
  npm run test -w @promptix/web
  ~~~

  Expected: ERR_MODULE_NOT_FOUND for src/lib/provider-text-test-ui.ts.

- [ ] **Step 3: Add narrow client-side types, pure UI helpers, and dialog state.**

  Add to adminModels.ts:

  ~~~ts
  export type ProviderTextTestResult = {
    ok: true;
    providerId: string;
    modelId: string;
    latencyMs: number;
    checkedAt: string;
  };

  export type ProviderTextTestJob = {
    id: string;
    status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    modelId: string | null;
    output?: ProviderTextTestResult | null;
    errorMessage?: string | null;
  };
  ~~~

  Create apps/web/src/lib/provider-text-test-ui.ts using the existing ProviderConnection and AdminModel types:

  ~~~ts
  export function eligibleProviderTextModels(provider: ProviderConnection, models: AdminModel[]) {
    return models.filter((model) =>
    model.providerId === provider.id &&
    provider.enabled &&
    model.enabled &&
    model.capabilities.includes('text'),
    );
  }

  export function initialProviderTextTestModelId(models: AdminModel[]) {
    return models.find((model) => model.isDefaultText)?.id ?? models[0]?.id ?? '';
  }

  export function isProviderTextTestPending(status: ProviderTextTestJob['status']) {
    return status === 'pending' || status === 'queued' || status === 'running';
  }
  ~~~

  In ProviderModelsPage, add state for selected Provider, selected Model ID, current test job, and submit state. openProviderTest(provider) uses the helper to select the eligible default-text Model first, otherwise the first eligible Model. When there is no eligible Model, set the existing page message to Add an enabled text model before testing this provider and do not open the dialog.

- [ ] **Step 4: Implement submit, polling, and constrained result rendering.**

  Submit only the selected UUID:

  ~~~ts
  const created = await api<{ jobId: string; status: 'queued' }>(
    '/api/admin/providers/' + provider.id + '/test',
    { method: 'POST', body: JSON.stringify({ modelId: selectedModelId }) },
  );
  ~~~

  Poll /api/admin/jobs/{jobId} every 1.5 seconds until succeeded, failed, or cancelled, and clear the interval in effect cleanup. While queued or running, disable submit and close controls. On success display the selected Model name, output.latencyMs, and Connection and text call succeeded; do not render arbitrary job.output JSON. On failure display errorMessage and a link to /admin/jobs.

  Add a secondary Test connection button to each Provider card. The dialog must have role="dialog", aria-modal="true", a labelled title, a visible fixed-low-cost-request disclosure, and a select control with the eligible Models.

- [ ] **Step 5: Run the Web unit test, type-check, and manually verify all UI states.**

  ~~~powershell
  npm run test -w @promptix/web
  npm run build -w @promptix/web
  ~~~

  Then verify at http://localhost:5173/admin/providers:

  1. No eligible Model produces an actionable message and no HTTP request.
  2. Two eligible Models default to the default-text Model but allow another selection.
  3. A valid test transitions Queued to Running to Succeeded and shows only model name plus latency.
  4. An invalid key transitions to Failed, contains no secret, and links to Task Center.
  5. Closing or navigating away clears polling.

- [ ] **Step 6: Commit the UI and its focused tests.**

  ~~~powershell
  git add package.json apps/web/package.json apps/web/src/types/adminModels.ts apps/web/src/lib/provider-text-test-ui.ts apps/web/src/pages/admin/ProviderModelsPage.tsx apps/web/test/provider-text-test-ui.test.ts
  git commit -m "feat: add provider connection test dialog"
  ~~~

### Task 5: Document and verify the end-to-end operational flow

**Files:**
- Modify: docs/ops.md:20-28

**Interfaces:**
- Documents the final admin workflow; no runtime interfaces change.

- [ ] **Step 1: Add the Provider test runbook.**

  Under the Provider and Model operations section, add:

  ~~~markdown
  - 在 Providers & Models 中选择 Provider 的“测试连接”，再选择已启用且具备 text 能力的 Model。
  - 检查会创建 provider_test 队列任务，并使用 Worker 的实际密钥、网络和模型调用链；成功仅记录 Provider/Model、耗时和检查时间。
  - 失败时先在任务中心查看安全错误摘要：密钥未配置、401/403、404、429、超时或网络失败；修复后可重试。
  - “key 已配置”仅表示 API 进程读到了环境变量，不能替代一次成功的连接测试。
  ~~~

- [ ] **Step 2: Run complete automated verification.**

  ~~~powershell
  git diff --check
  npm run build
  npm test
  ~~~

  Expected: no whitespace errors, every workspace build succeeds, and all shared, API, and Worker Node tests pass.

- [ ] **Step 3: Perform the production-equivalent smoke test.**

  With a low-cost non-production Provider key, run one successful test and one deliberate invalid-key test. Confirm the success output has exactly ok, providerId, modelId, latencyMs, and checkedAt. Confirm the failed errorMessage contains no API key or authorization header and that retry succeeds after restoring the valid key.

- [ ] **Step 4: Commit the runbook.**

  ~~~powershell
  git add docs/ops.md
  git commit -m "docs: explain provider connection testing"
  ~~~
