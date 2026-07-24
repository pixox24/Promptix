# Autopublish Delegated Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe owner/admin control for enabling or disabling delegated one-click autopublishing.

**Architecture:** Extend the existing immutable autopublish rule-version service with one boolean-only mutation and expose it through a dedicated admin route. Return active control state from the overview endpoint and render a confirmed, server-backed control card in the existing operations page.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, React, Node test runner, oxlint.

## Global Constraints

- Default `delegatedEnabled` remains `false`.
- Default execution mode remains `shadow`.
- Do not expose or mutate `scheduledAgentEnabled`.
- Do not expose quality, safety, duplicate, budget, or permit settings.
- Every mutation creates a new governance rule version and audit event.
- Preserve unrelated dirty design, plan, and lock files.

---

### Task 1: Delegated Rule Operation and API

**Files:**
- Modify: `apps/api/src/lib/autopublish-operations.ts`
- Modify: `apps/api/src/routes/autopublish.ts`
- Test: `apps/api/test/template-autopublish-operations.test.mjs`

**Interfaces:**
- Consumes: `createAutopublishOperations(repository)` and active `rules.autopublish`.
- Produces: `operations.delegated({ actorId, reason, enabled })` and `POST /api/admin/autopublish/delegated`.

- [ ] **Step 1: Write failing service and route tests**

Add a test that starts with:

```js
rules: {
  autopublish: {
    delegatedEnabled: false,
    scheduledAgentEnabled: false,
    mode: 'shadow',
    frozen: false,
  },
}
```

Call:

```js
await operations.delegated({
  actorId: 'owner-1',
  reason: 'enable delegated testing',
  enabled: true,
});
```

Assert `delegatedEnabled === true`, `scheduledAgentEnabled === false`, `mode === 'shadow'`, a new version exists, and one audit record is written. Extend the route source-contract assertion with `post('/delegated'`.

- [ ] **Step 2: Run the focused API test and verify RED**

Run:

```powershell
npm run build -w @promptix/api
node --test apps/api/test/template-autopublish-operations.test.mjs
```

Expected: FAIL because `operations.delegated` and the route do not exist.

- [ ] **Step 3: Implement the boolean-only rule mutation**

Extend `change()` with:

```ts
delegatedEnabled?: boolean;
```

and merge only:

```ts
...(input.delegatedEnabled === undefined
  ? {}
  : { delegatedEnabled: input.delegatedEnabled })
```

Expose:

```ts
delegated(input: {
  actorId: string;
  reason: string;
  enabled: boolean;
}) {
  return change({ ...input, delegatedEnabled: input.enabled });
}
```

Make `overview()` combine trigger metrics with active rule control state:

```ts
{
  mode,
  frozen,
  delegatedEnabled,
  scheduledAgentEnabled,
  triggers,
}
```

- [ ] **Step 4: Implement the dedicated route**

Add:

```ts
autopublishRoutes.post('/delegated', async (c) => {
  const body = await c.req.json<{ enabled?: unknown; reason?: unknown }>();
  if (typeof body.enabled !== 'boolean') {
    throw new AutopublishServiceError('AUTOPUBLISH_DELEGATED_VALUE_INVALID');
  }
  const reason = typeof body.reason === 'string' && body.reason.trim()
    ? body.reason.trim()
    : 'operations console';
  return c.json({
    data: await databaseAutopublishOperations().delegated({
      actorId: c.get('admin').sub,
      reason,
      enabled: body.enabled,
    }),
  });
});
```

Use the route’s existing `try/catch` and stable `errorResponse` pattern.

- [ ] **Step 5: Run API tests and build**

Run:

```powershell
npm run test -w @promptix/api
npm run build -w @promptix/api
```

Expected: all API tests and build PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/lib/autopublish-operations.ts apps/api/src/routes/autopublish.ts apps/api/test/template-autopublish-operations.test.mjs
git commit -m "feat: control delegated autopublish"
```

---

### Task 2: Delegated Control Card

**Files:**
- Modify: `apps/web/src/pages/admin/AutopublishPage.tsx`
- Test: `apps/web/test/autopublish-operations-ui.test.ts`
- Test: `apps/web/test/autopublish-accessibility.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/autopublish/overview` control state.
- Produces: confirmed `POST /api/admin/autopublish/delegated` mutations.

- [ ] **Step 1: Write failing UI source-contract tests**

Assert the page contains:

```ts
/启用用户委托一键发布/
/delegatedEnabled/
/\/api\/admin\/autopublish\/delegated/
/shadow 模式只演练/
/aria-checked/
```

- [ ] **Step 2: Run focused Web tests and verify RED**

Run:

```powershell
node --import tsx --test apps/web/test/autopublish-operations-ui.test.ts apps/web/test/autopublish-accessibility.test.ts
```

Expected: FAIL because the control card is absent.

- [ ] **Step 3: Implement server-backed state**

Add:

```ts
type AutopublishOverviewView = {
  mode: Mode;
  frozen: boolean;
  delegatedEnabled: boolean;
  scheduledAgentEnabled: boolean;
};
```

Store `delegatedEnabled`, initialize it only from overview, and add a `changingDelegated` busy state.

- [ ] **Step 4: Implement confirmed mutation and control card**

On toggle, confirm the precise effect, then call:

```ts
await api('/api/admin/autopublish/delegated', {
  method: 'POST',
  body: JSON.stringify({
    enabled: next,
    reason: 'operations console',
  }),
});
```

Only update UI after the request succeeds, show a global Toast, and refresh overview. Render a switch with `role="switch"` and `aria-checked={delegatedEnabled}` plus copy distinguishing `shadow` from `live`.

- [ ] **Step 5: Run Web tests, build, lint and diff check**

Run:

```powershell
npm run test -w @promptix/web
npm run build -w @promptix/web
npm run lint
git diff --check
```

Expected: tests/build PASS, lint has no new errors, diff check exits 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/pages/admin/AutopublishPage.tsx apps/web/test/autopublish-operations-ui.test.ts apps/web/test/autopublish-accessibility.test.ts
git commit -m "feat: add delegated autopublish switch"
```

---

### Task 3: Repository Verification

**Files:**
- No production changes expected.

**Interfaces:**
- Verifies the API and Web tasks together.

- [ ] **Step 1: Run complete verification**

```powershell
npm test
npm run build
npm run lint
git diff --check
```

Expected: all tests and builds PASS; lint has no errors; diff check exits 0.

- [ ] **Step 2: Inspect final state**

```powershell
git status --short
git log -3 --oneline
```

Expected: only the previously preserved unrelated dirty files remain.
