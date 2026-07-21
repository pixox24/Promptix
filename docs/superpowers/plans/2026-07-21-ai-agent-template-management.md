# AI Agent Template Management Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with strict red-green-refactor discipline. Do not batch unrelated tasks. Preserve the user's existing working-tree changes and stage only the files named by the active task.

**Goal:** Replace the flat `/admin/templates` list with the approved “智能分拣台” governance workspace and add a safe, versioned, auditable Agent workflow for scheduled inspection, ad-hoc instructions, automatic metadata governance, rule-bounded featured management, approval-gated lifecycle changes, and rollback.

**Architecture:** Keep `prompt_templates` as the current materialized template record and add immutable versions plus governance run, proposal, change-set, approval, rule-set, and audit tables. Use the existing BullMQ queue and Worker for asynchronous planning and execution. Expose dedicated governance APIs and constrained Agent-tool contracts instead of widening the existing template CRUD surface. The web app uses a three-column queue/list/inspector layout, URL-backed query state, server-side pagination, and explicit query-scope selection.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle ORM/PostgreSQL, BullMQ 5, AI SDK structured output, React 19, React Router 7, Tailwind CSS, Node test runner, oxlint.

**Source design:** `docs/superpowers/specs/2026-07-21-ai-agent-template-management-design.md`

## Global Constraints

- Keep `/admin/templates`, `/admin/templates/new`, and `/admin/templates/:id` stable.
- The selected UI direction is “智能分拣台”: work queues on the left, dense batch list in the center, preview and Agent reasoning on the right.
- Do not replace the management experience with a chat-only UI.
- Automatic changes may update title, summary, semantic classification, and tags when validation and policy checks pass.
- Featured status/order may change automatically only inside the active rule-set limits.
- Publish, archive, permanent delete, Prompt skeleton changes, and variable-definition changes always require explicit approval.
- Permanent deletion requires a second typed confirmation and is not advertised as rollbackable.
- Every Agent write records a base version, before/after diff, reason codes, confidence, risk, run, change set, and audit events.
- Every non-delete change set has a seven-day rollback window by default.
- All mutations use an idempotency key and optimistic `currentVersion` check.
- Queue, filter, sort, page, selected proposal, and selection mode are URL-restorable.
- Query-wide selection means “all items matching the captured query minus exclusions”; resolve it to explicit proposal/template IDs before execution.
- The default scheduled patrol runs daily at 03:00 in `Asia/Shanghai`, scans at most 50 templates, and can be changed or disabled through the active rule set.
- Seed conservative featured defaults: 12 slots, minimum confidence `0.85`, maximum 20% slot replacement per run, at least 24 hours between automatic featured adjustments.
- Do not add custom folders, multi-tenant workspaces, prompt history UI, or arbitrary Agent database access in this implementation.
- Do not stage or overwrite unrelated dirty files.

## Target File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/template-governance.ts` | Governance enums, schemas, DTOs, selection scope, risk classification, template/version snapshots. |
| `packages/shared/src/index.ts` | Re-export governance contracts and extend job types. |
| `packages/shared/test/template-governance.test.mjs` | Schema, policy-boundary, and serialization tests. |
| `apps/api/src/db/schema.ts` | Versioning and governance Drizzle tables. |
| `apps/api/drizzle/0010_template_governance.sql` | Additive migration, version backfill, indexes, and default rule set. |
| `apps/api/drizzle/meta/0010_snapshot.json` | Generated Drizzle snapshot. |
| `apps/api/drizzle/meta/_journal.json` | Migration journal entry. |
| `apps/api/test/template-governance-migration.test.mjs` | Additive migration and backfill contract. |
| `apps/api/src/lib/template-versioning.ts` | Snapshot building, optimistic version checks, and manual-write version recording. |
| `apps/api/src/lib/governance-query.ts` | Queue counts, paginated search, detail projection, and captured query scopes. |
| `apps/api/src/lib/governance-service.ts` | Run/change-set/approval orchestration behind repository interfaces. |
| `apps/api/src/lib/governance-repository.ts` | Drizzle implementation for governance service. |
| `apps/api/src/lib/governance-tools.ts` | Exact constrained Agent-tool facade over query and service methods. |
| `apps/api/src/lib/governance-scheduler.ts` | BullMQ job-scheduler registration from the active rule set. |
| `apps/api/src/routes/governance.ts` | Authenticated governance HTTP surface. |
| `apps/api/src/routes/templates.ts` | Version-aware manual writes and approval-gated lifecycle operations. |
| `apps/api/src/routes/jobs.ts` | Reject generic creation of governance-only job types. |
| `apps/api/src/index.ts` | Mount governance routes and register the scheduler. |
| `apps/api/test/template-versioning.test.mjs` | Optimistic version and snapshot tests. |
| `apps/api/test/governance-query.test.mjs` | Filter/sort/cursor/scope parsing and queue contracts. |
| `apps/api/test/governance-service.test.mjs` | Run, approval, idempotency, rule-version, and enqueue orchestration tests. |
| `apps/api/test/governance-scheduler.test.mjs` | Scheduler ID, cron, timezone, and disabled-state tests. |
| `apps/worker/src/db.ts` | Worker-side governance table projections. |
| `apps/worker/src/governance-prompt.ts` | Fixed, versioned planning system prompt and structured output schema. |
| `apps/worker/src/governance-quality.ts` | Deterministic quality and duplicate candidate signals. |
| `apps/worker/src/template-governance-planner.ts` | Build proposals and change sets from a run. |
| `apps/worker/src/template-governance-executor.ts` | Policy recheck, transactional apply, partial failure, audit, and rollback. |
| `apps/worker/src/index.ts` | Dispatch manual, scheduled, apply, and rollback governance queue work. |
| `apps/worker/src/model-routing.ts` | Capabilities for governance planning versus non-model execution. |
| `apps/worker/test/governance-quality.test.mjs` | Quality/duplicate signals. |
| `apps/worker/test/template-governance-planner.test.mjs` | Structured proposal normalization and risk assignment. |
| `apps/worker/test/template-governance-executor.test.mjs` | Idempotency, concurrency, partial failure, and rollback. |
| `apps/web/src/types/templateGovernance.ts` | Web-facing governance types. |
| `apps/web/src/data/templateGovernanceApi.ts` | Governance API client functions. |
| `apps/web/src/lib/templateGovernanceState.ts` | URL state, selection semantics, and display mappings. |
| `apps/web/src/hooks/useTemplateGovernance.ts` | Fetching, aborting stale requests, polling, and selection controller. |
| `apps/web/src/pages/admin/TemplateGovernancePage.tsx` | Three-column page composition. |
| `apps/web/src/components/admin/governance/GovernanceQueueSidebar.tsx` | Work queues, source views, quick filters, and patrol state. |
| `apps/web/src/components/admin/governance/GovernanceCommandBar.tsx` | Ad-hoc instruction planning entry. |
| `apps/web/src/components/admin/governance/GovernanceTemplateTable.tsx` | Dense list, pagination, and row selection. |
| `apps/web/src/components/admin/governance/GovernanceBulkBar.tsx` | Context-aware batch actions and selection-scope copy. |
| `apps/web/src/components/admin/governance/GovernanceInspector.tsx` | Preview, reasoning, confidence, diff, and history. |
| `apps/web/src/components/admin/governance/GovernanceApprovalPanel.tsx` | Plan review, approval/rejection, delete confirmation, execution report, rollback. |
| `apps/web/src/components/admin/governance/GovernanceRulePanel.tsx` | Schedule and featured-policy editing. |
| `apps/web/src/pages/AdminPage.tsx` | Route the template list to the new page and make editor writes version-aware. |
| `apps/web/test/template-governance-state.test.ts` | URL and cross-page selection tests. |
| `apps/web/test/template-governance-layout.test.ts` | Three-column composition and no-inline-action contract. |
| `apps/web/test/template-governance-approval.test.ts` | Risk/approval/delete-confirmation UI contracts. |
| `apps/web/test/template-editor-versioning.test.ts` | Expected-version and conflict handling. |

---

## Task 1: Define Shared Governance Contracts and Risk Boundaries

**Files:**
- Create: `packages/shared/src/template-governance.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/template-governance.test.mjs`

**Interfaces produced:** Stable queue IDs, run/change-set/proposal statuses, action types, risk levels, rule-set schema, selection scope, version snapshot, proposal patch, Agent structured output, API DTOs.

- [ ] **Step 1: Write failing contract tests**

Cover at minimum:

- queue IDs are exactly `taxonomy_confirmation`, `duplicate_candidates`, `quality_issues`, `featured_candidates`, `pending_approval`, `failed_items`;
- `explicit` scope requires IDs and `query` scope stores filters plus exclusions;
- automatic fields accept `name`, `summary`, `semantic`, and `tags`;
- `promptTemplate`, `variables`, `publish`, `archive`, and `delete` are always classified as `high` risk and `requiresApproval: true`;
- featured changes become automatic only when confidence, slot, replacement-ratio, and cooldown rules pass;
- template snapshots and proposal DTOs round-trip through Zod;
- status and reason values serialize as stable English identifiers, never localized display strings.

- [ ] **Step 2: Run the shared test and verify RED**

Run:

```bash
npm run test -w @promptix/shared
```

Expected: FAIL because `template-governance.ts` and its exports do not exist.

- [ ] **Step 3: Add the schemas and pure policy classifier**

Define these core exports:

```ts
governanceQueueIdSchema
governanceTriggerSchema
governanceRunStatusSchema
governanceChangeSetStatusSchema
governanceProposalStatusSchema
governanceItemStatusSchema
governanceRiskLevelSchema
governanceActionSchema
governanceReasonCodeSchema
governanceRuleSetSchema
governanceSelectionScopeSchema
templateVersionSnapshotSchema
governanceProposalPatchSchema
governanceProposalOutputSchema
classifyGovernanceRisk(input, rules)
```

`governanceProposalPatchSchema` may include automatic metadata, featured fields, Prompt/variable fields, and a separate lifecycle action. The classifier, not the LLM, is authoritative for risk and approval.

- [ ] **Step 4: Add governance-only job types**

Extend `jobTypeSchema` with:

```ts
'template_governance_plan'
'template_governance_apply'
'template_governance_rollback'
```

Do not allow these through the generic admin job creation endpoint in a later task.

- [ ] **Step 5: Run shared tests and build**

Run:

```bash
npm run test -w @promptix/shared
```

Expected: PASS with zero failures.

- [ ] **Step 6: Commit shared contracts**

```bash
git add packages/shared/src/template-governance.ts packages/shared/src/index.ts packages/shared/test/template-governance.test.mjs
git commit -m "feat: define template governance contracts"
```

---

## Task 2: Add Versioning and Governance Persistence

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0010_template_governance.sql`
- Create: `apps/api/drizzle/meta/0010_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/test/template-governance-migration.test.mjs`

**Tables and columns:**

- Add `prompt_templates.current_version integer not null default 1`.
- `template_versions`: immutable snapshot per `(template_id, version)` with source, actor, run/change-set links, and timestamp.
- `governance_rule_sets`: versioned JSON rules, enabled flag, creator, timestamps.
- `agent_runs`: trigger, goal, captured scope, prompt version, rule-set/version, model, state, progress, stats, error, requester, timestamps.
- `governance_proposals`: run/template/base version, before snapshot, proposed patch, reason codes, explanation, confidence, authoritative risk/approval, validation, state.
- `governance_change_sets`: run, captured scope, exclusions, rule-set/version, idempotency key, state, summary, rollback deadline, timestamps.
- `governance_change_set_items`: change set, proposal, template, item state, applied version, error.
- `governance_approvals`: change set, decision, approved scope, reviewer, note, rule-set version, timestamp.
- `governance_audit_events`: actor, event type, target, run/change-set/proposal links, payload, timestamp.

- [ ] **Step 1: Write the migration contract test**

Assert the migration:

- is additive and contains no `DROP`, `TRUNCATE`, or destructive `DELETE`;
- creates every table and required foreign key/index/check constraint;
- adds `current_version` with a safe default;
- backfills one version-1 snapshot per existing template;
- seeds one enabled rule set with the approved schedule and conservative featured limits;
- uses `ON CONFLICT` or equivalent idempotent seed behavior;
- prevents duplicate `(template_id, version)` and duplicate idempotency keys.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm run build -w @promptix/api
node --test apps/api/test/template-governance-migration.test.mjs
```

Expected: FAIL with `ENOENT` for migration `0010`.

- [ ] **Step 3: Add Drizzle tables and generate migration metadata**

Run:

```bash
npm run db:generate -w @promptix/api -- --name template_governance
```

Normalize the generated filename/tag to `0010_template_governance` only if needed. Do not hand-edit the generated snapshot except for deterministic formatting.

- [ ] **Step 4: Add safe backfill and default rule-set seed**

The template-version backfill must construct JSON snapshots from existing template columns and taxonomy assignments. It must not change the current template values or public ordering.

Seed rules:

```json
{
  "schedule": { "enabled": true, "cron": "0 3 * * *", "timezone": "Asia/Shanghai", "scanLimit": 50 },
  "automaticFields": ["name", "summary", "semantic", "tags"],
  "alwaysApprove": ["promptTemplate", "variables", "publish", "archive", "delete"],
  "minimumAutoConfidence": 0.85,
  "maximumAutoBatchSize": 50,
  "rollbackHours": 168,
  "featured": { "slotLimit": 12, "maximumReplacementRatio": 0.2, "minimumAdjustmentHours": 24 }
}
```

- [ ] **Step 5: Run migration test and API build**

```bash
npm run build -w @promptix/api
node --test apps/api/test/template-governance-migration.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0010_template_governance.sql apps/api/drizzle/meta/0010_snapshot.json apps/api/drizzle/meta/_journal.json apps/api/test/template-governance-migration.test.mjs
git commit -m "feat: persist template governance history"
```

---

## Task 3: Make Existing Template Writes Version-Aware

**Files:**
- Create: `apps/api/src/lib/template-versioning.ts`
- Modify: `apps/api/src/routes/templates.ts`
- Create: `apps/api/test/template-versioning.test.mjs`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Create: `apps/web/test/template-editor-versioning.test.ts`

**Behavior:** All create/edit/featured/cover content writes create immutable snapshots. Existing public reads remain unchanged.

- [ ] **Step 1: Write failing versioning tests**

Use pure snapshot/diff helpers and an injected fake transaction repository to prove:

- template creation records version 1;
- a successful patch with `expectedVersion: 1` produces version 2;
- a stale patch returns `VERSION_CONFLICT` and writes nothing;
- taxonomy assignment changes are included in the version snapshot;
- changing only title does not silently change featured or taxonomy-review state;
- repeating the same idempotency key returns the original result.

Add a web source/logic test that requires the editor to store `currentVersion`, send `expectedVersion`, and render a conflict recovery message.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm run build -w @promptix/api
node --test apps/api/test/template-versioning.test.mjs
node --import tsx --test apps/web/test/template-editor-versioning.test.ts
```

Expected: FAIL because version helpers and editor payload do not exist.

- [ ] **Step 3: Implement snapshot and optimistic update helpers**

Provide:

```ts
buildTemplateVersionSnapshot(template, semantic)
recordInitialTemplateVersion(tx, template, semantic, actor)
updateTemplateWithVersion(tx, input)
```

`updateTemplateWithVersion` must update with `WHERE id = ? AND current_version = ?`, increment exactly once, insert the immutable snapshot in the same transaction, and return a typed conflict when zero rows update.

- [ ] **Step 4: Integrate manual create, patch, featured, and cover writes**

- Create records version 1 after taxonomy assignments are written.
- PATCH requires `expectedVersion` and an idempotency key.
- Cover upload includes the expected version in multipart data and records the resulting reference.
- Existing lifecycle endpoints are left operational until Task 7 switches them to approval flow.

- [ ] **Step 5: Update the existing editor**

- Read `currentVersion` from the template response.
- Send it for save and cover upload.
- On `VERSION_CONFLICT`, keep local edits, show that the server version changed, and offer reload; never silently overwrite.

- [ ] **Step 6: Run focused API/web tests**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/web
```

Expected: PASS.

- [ ] **Step 7: Commit version-aware writes**

```bash
git add apps/api/src/lib/template-versioning.ts apps/api/src/routes/templates.ts apps/api/test/template-versioning.test.mjs apps/web/src/pages/AdminPage.tsx apps/web/test/template-editor-versioning.test.ts
git commit -m "feat: version template mutations"
```

---

## Task 4: Add Governance Queues, Search, and Inspection APIs

**Files:**
- Create: `apps/api/src/lib/governance-query.ts`
- Create: `apps/api/src/lib/governance-tools.ts`
- Create: `apps/api/src/routes/governance.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/test/governance-query.test.mjs`

**HTTP surface:**

- `GET /api/admin/governance/queues`
- `GET /api/admin/governance/templates`
- `GET /api/admin/governance/templates/:id`
- `GET /api/admin/governance/runs`
- `GET /api/admin/governance/runs/:id`
- `GET /api/admin/governance/change-sets/:id`
- `GET /api/admin/governance/change-sets/:id/preview`

- [ ] **Step 1: Write failing parser and query-projection tests**

Cover:

- page size `1..100`, stable sort with `id` tiebreaker, and opaque cursor;
- queue, source, lifecycle, output type, scenario, style, subject, quality, Agent status, text query, and updated-time filters;
- invalid queue or taxonomy values return typed validation errors;
- detail projection includes current snapshot, active proposal, reason, confidence, history, and approval state;
- queue counts use the same predicates as the list endpoint;
- fields selection cannot expose internal model credentials or unrelated job input.

- [ ] **Step 2: Verify RED**

```bash
npm run build -w @promptix/api
node --test apps/api/test/governance-query.test.mjs
```

- [ ] **Step 3: Implement shared filter parsing and Drizzle queries**

Use one parsed `GovernanceTemplateQuery` for counts, page results, captured query scopes, and Agent `search_templates`. Avoid duplicating queue predicates in the route.

- [ ] **Step 4: Add authenticated read routes**

Return `{ items, nextCursor, total, querySnapshot }`, not a bare array. Queue counts return stable queue IDs plus localized labels supplied separately by the web display map.

Add the first constrained tool-facade functions with exact machine-facing names:

```ts
search_templates(input)
inspect_template(input)
validate_template(input)
```

The route and future Agent integrations must call this facade instead of constructing independent queries.

- [ ] **Step 5: Run API tests**

```bash
npm run test -w @promptix/api
```

- [ ] **Step 6: Commit governance reads**

```bash
git add apps/api/src/lib/governance-query.ts apps/api/src/lib/governance-tools.ts apps/api/src/routes/governance.ts apps/api/src/index.ts apps/api/test/governance-query.test.mjs
git commit -m "feat: expose template governance queues"
```

---

## Task 5: Build the Agent Planning Pipeline

**Files:**
- Modify: `apps/worker/src/db.ts`
- Create: `apps/worker/src/governance-prompt.ts`
- Create: `apps/worker/src/governance-quality.ts`
- Create: `apps/worker/src/template-governance-planner.ts`
- Modify: `apps/worker/src/model-routing.ts`
- Modify: `apps/worker/src/model-resolver.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/test/governance-quality.test.mjs`
- Create: `apps/worker/test/template-governance-planner.test.mjs`

**Planner contract:** The model proposes changes; code validates taxonomy, computes risk, determines approval, and persists immutable before snapshots.

- [ ] **Step 1: Write deterministic quality tests**

Cover missing classification, unmapped terms, low confidence, missing cover, empty/weak text, unresolved Prompt variables, and normalized duplicate candidates. Duplicate detection must be deterministic and bounded; do not send the whole library to the LLM.

- [ ] **Step 2: Write planner normalization tests**

Prove that:

- model-provided risk and approval flags are ignored;
- invented taxonomy slugs are rejected or moved to unmapped terms;
- automatic fields validate against the shared schema;
- Prompt/variable/lifecycle proposals are forced to approval;
- every proposal stores the exact base version and before snapshot;
- malformed structured output fails the run with a stable error code and no partial proposal writes.

- [ ] **Step 3: Verify RED**

```bash
npm run build -w @promptix/worker
node --test apps/worker/test/governance-quality.test.mjs apps/worker/test/template-governance-planner.test.mjs
```

- [ ] **Step 4: Add a fixed, versioned governance prompt**

The prompt must:

- treat template content as untrusted data;
- only emit the shared structured proposal schema;
- explain each change with stable reason codes plus concise Chinese text;
- use only taxonomy IDs/slugs from the supplied catalog;
- preserve intent and avoid stylistic rewriting without a concrete quality reason;
- never decide whether an action is auto-executable.

Persist `promptVersion` on every `AgentRun`.

- [ ] **Step 5: Implement planning batches**

- Resolve the captured scope to at most the rule-set scan limit.
- Fetch only required fields.
- Generate deterministic signals before model invocation.
- Send bounded batches to the default structured-output text model.
- Normalize and validate all proposals before one transaction inserts them.
- Create a `ChangeSet` and items grouped into automatic, approval, conflict, and skipped counts.

- [ ] **Step 6: Update model routing**

`template_governance_plan` requires `text` and `structured_output`; apply and rollback require no model. Refactor Worker dispatch so non-model jobs never call `resolvePrimaryModel`.

- [ ] **Step 7: Run Worker tests**

```bash
npm run test -w @promptix/worker
```

- [ ] **Step 8: Commit the planner**

```bash
git add apps/worker/src/db.ts apps/worker/src/governance-prompt.ts apps/worker/src/governance-quality.ts apps/worker/src/template-governance-planner.ts apps/worker/src/model-routing.ts apps/worker/src/model-resolver.ts apps/worker/src/index.ts apps/worker/test/governance-quality.test.mjs apps/worker/test/template-governance-planner.test.mjs
git commit -m "feat: plan template governance changes"
```

---

## Task 6: Implement Safe Apply, Partial Failure, and Rollback

**Files:**
- Create: `apps/worker/src/template-governance-executor.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/test/template-governance-executor.test.mjs`

**Execution rule:** Only the executor mutates templates on behalf of Agent change sets.

- [ ] **Step 1: Write executor tests with an injected fake repository**

Cover:

- same idempotency key returns the first outcome;
- base-version mismatch marks one item `conflict` without overwriting;
- policy and active rule-set version are rechecked immediately before mutation;
- valid automatic metadata changes apply and create the next template version;
- featured changes exceeding any rule become `awaiting_approval`;
- one item failure does not roll back independent successful items;
- retry only processes failed/retryable items;
- rollback restores the before snapshot as a new version, never deletes history;
- rollback conflict does not overwrite later manual edits;
- rollback after the deadline is rejected;
- permanent delete is excluded from rollback.

- [ ] **Step 2: Verify RED**

```bash
npm run build -w @promptix/worker
node --test apps/worker/test/template-governance-executor.test.mjs
```

- [ ] **Step 3: Implement transactional item execution**

For each item:

1. lock/read the current template;
2. compare `currentVersion` to `baseVersion`;
3. re-run schema, taxonomy, risk, approval, and rule-set checks;
4. update template and assignments atomically;
5. increment version and insert immutable snapshot;
6. record audit event and item result.

Process independent items separately so one failure produces `partially_succeeded`, not a global rollback.

- [ ] **Step 4: Implement rollback as forward version creation**

Restore the stored before snapshot only if the expected applied version is still current. Record a new version with source `rollback` and connect it to the original change set.

- [ ] **Step 5: Wire apply and rollback job dispatch**

`template_governance_plan` may immediately execute its policy-approved automatic subset through the same executor. Approval and rollback jobs call the same entry points.

- [ ] **Step 6: Run Worker tests**

```bash
npm run test -w @promptix/worker
```

- [ ] **Step 7: Commit executor**

```bash
git add apps/worker/src/template-governance-executor.ts apps/worker/src/index.ts apps/worker/test/template-governance-executor.test.mjs
git commit -m "feat: execute and rollback governance changes"
```

---

## Task 7: Add Commands, Rules, Approvals, and Lifecycle Enforcement

**Files:**
- Create: `apps/api/src/lib/governance-repository.ts`
- Create: `apps/api/src/lib/governance-service.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: `apps/api/src/routes/governance.ts`
- Modify: `apps/api/src/routes/templates.ts`
- Modify: `apps/api/src/routes/jobs.ts`
- Create: `apps/api/test/governance-service.test.mjs`

**Write endpoints:**

- `POST /api/admin/governance/runs`
- `POST /api/admin/governance/change-sets`
- `POST /api/admin/governance/change-sets/:id/submit`
- `POST /api/admin/governance/change-sets/:id/approve`
- `POST /api/admin/governance/change-sets/:id/reject`
- `POST /api/admin/governance/change-sets/:id/retry`
- `POST /api/admin/governance/change-sets/:id/rollback`
- `GET /api/admin/governance/rule-sets/active`
- `PUT /api/admin/governance/rule-sets/active`

- [ ] **Step 1: Write orchestration tests**

With fake repository and queue ports, prove:

- a natural-language command stores structured scope before enqueue;
- generic `/api/admin/jobs` refuses governance-only job types;
- submitting a plan creates an immutable approval request;
- approval fails if rule-set version or proposal base versions changed;
- publish/archive/delete can only reach execution through an approved change set;
- delete approval requires exact typed confirmation and a non-empty reason;
- repeated approve/retry/rollback requests are idempotent;
- queue failure leaves a visible failed run/change-set, never a permanent `queued` state.

- [ ] **Step 2: Verify RED**

```bash
npm run build -w @promptix/api
node --test apps/api/test/governance-service.test.mjs
```

- [ ] **Step 3: Implement repository-backed orchestration**

Keep Hono handlers thin. `governance-service.ts` owns state-transition validation and receives repository/queue/time/idempotency dependencies for testability.

Complete the constrained tool facade with exact names:

```ts
plan_changes(input)
preview_changes(input)
execute_auto_changes(input)
submit_for_approval(input)
get_change_set_status(input)
rollback_change_set(input)
```

Every function parses input with the shared Zod contract, selects only necessary output fields, and delegates mutations to the policy-enforcing service. None accepts raw SQL, arbitrary table/field names, or an unvalidated generic patch.

- [ ] **Step 4: Enforce lifecycle approval**

Replace direct publish/archive/delete execution with one-item governance change-set creation. Return `202` plus `{ changeSetId, status: 'awaiting_approval' }`. The actual mutation remains in the Worker executor.

For published templates, an Agent-proposed Prompt skeleton or variable change must also produce an approval item; automatic execution must reject it even if a malformed client sets `requiresApproval: false`.

- [ ] **Step 5: Run API tests**

```bash
npm run test -w @promptix/api
```

- [ ] **Step 6: Commit governance writes**

```bash
git add apps/api/src/lib/governance-repository.ts apps/api/src/lib/governance-service.ts apps/api/src/lib/governance-tools.ts apps/api/src/routes/governance.ts apps/api/src/routes/templates.ts apps/api/src/routes/jobs.ts apps/api/test/governance-service.test.mjs
git commit -m "feat: govern template approvals and lifecycle"
```

---

## Task 8: Register the Scheduled Patrol Safely

**Files:**
- Create: `apps/api/src/lib/governance-scheduler.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/api/test/governance-scheduler.test.mjs`

**BullMQ API:** Use the installed BullMQ 5 `queue.upsertJobScheduler(jobSchedulerId, repeatOpts, jobTemplate)` API with one stable scheduler ID. Multiple API replicas must converge on the same scheduler.

- [ ] **Step 1: Write scheduler tests**

Prove:

- enabled rules call `upsertJobScheduler` with stable ID `template-governance-default`;
- cron and timezone come from the active rule set;
- disabled rules remove or do not register the scheduler;
- scheduled queue data is `{ kind: 'governance_schedule', ruleSetId, ruleSetVersion }`;
- a scheduled tick creates one `AgentRun` and does not reuse a completed run;
- scheduler errors are logged and surfaced in governance status without preventing API startup.

- [ ] **Step 2: Verify RED**

```bash
npm run build -w @promptix/api
node --test apps/api/test/governance-scheduler.test.mjs
```

- [ ] **Step 3: Implement idempotent registration**

Register after environment/database initialization. Re-register after rule-set updates. Extend queue payload parsing to accept legacy `{ jobId }`, explicit governance jobs, and scheduled governance ticks without breaking existing generation jobs.

- [ ] **Step 4: Run API and Worker tests**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
```

- [ ] **Step 5: Commit scheduling**

```bash
git add apps/api/src/lib/governance-scheduler.ts apps/api/src/index.ts apps/worker/src/index.ts apps/api/test/governance-scheduler.test.mjs
git commit -m "feat: schedule template governance patrols"
```

---

## Task 9: Add Web Types, API Client, URL State, and Selection Semantics

**Files:**
- Create: `apps/web/src/types/templateGovernance.ts`
- Create: `apps/web/src/data/templateGovernanceApi.ts`
- Create: `apps/web/src/lib/templateGovernanceState.ts`
- Create: `apps/web/src/hooks/useTemplateGovernance.ts`
- Create: `apps/web/test/template-governance-state.test.ts`

- [ ] **Step 1: Write failing pure state tests**

Cover:

- default queue and sort;
- parsing and serializing every supported filter;
- changing queue/filter resets cursor and selected proposal;
- `explicit` selection toggles IDs;
- “select all matching” stores query snapshot plus exclusions;
- count copy distinguishes current page from all matching results;
- page refresh reconstructs the same query and selected detail;
- invalid URL values fall back safely;
- localized labels are mapped from stable status/reason codes.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test apps/web/test/template-governance-state.test.ts
```

- [ ] **Step 3: Implement DTOs and client functions**

Client functions map one-to-one to the governance HTTP surface. Do not expose raw `fetch` calls inside visual components.

- [ ] **Step 4: Implement the controller hook**

Responsibilities:

- URL-backed query state;
- abort stale list/detail requests;
- poll only active runs/change sets;
- retain selection while the current query identity is unchanged;
- clear invalid selections after query changes;
- surface distinct loading, empty, filtered-empty, offline, forbidden, conflict, and failed states.

- [ ] **Step 5: Run web tests**

```bash
npm run test -w @promptix/web
```

- [ ] **Step 6: Commit web state**

```bash
git add apps/web/src/types/templateGovernance.ts apps/web/src/data/templateGovernanceApi.ts apps/web/src/lib/templateGovernanceState.ts apps/web/src/hooks/useTemplateGovernance.ts apps/web/test/template-governance-state.test.ts
git commit -m "feat: model template governance state"
```

---

## Task 10: Build the Three-Column “智能分拣台”

**Files:**
- Create: `apps/web/src/pages/admin/TemplateGovernancePage.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceQueueSidebar.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceCommandBar.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceTemplateTable.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceBulkBar.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceInspector.tsx`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Create: `apps/web/test/template-governance-layout.test.ts`

- [ ] **Step 1: Write failing layout and interaction contract tests**

Assert:

- `/admin/templates` renders `TemplateGovernancePage`;
- queue, table, and inspector are separate components;
- the table contains selection, cover, source, current/suggested classification, quality/Agent state, lifecycle, and updated time;
- row actions are not all rendered inline;
- selecting rows reveals a context-aware bulk bar;
- clicking a row updates the inspector without navigating away;
- command submission shows interpreted scope and impact before enqueue;
- the existing new-template link and editor routes remain available.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test apps/web/test/template-governance-layout.test.ts
```

- [ ] **Step 3: Compose the selected visual direction**

Use the current Promptix Admin design language:

- retain the dark navy header, light workspace, violet accent, compact typography, and modest radii;
- left queue rail is narrow and count-oriented;
- center table remains the dominant surface;
- right inspector supports preview, current/proposed values, explanation, confidence, and history;
- use separators and alignment before cards/shadows;
- permit left rail narrowing and right inspector collapsing at smaller desktop widths;
- on narrow screens, present queues and inspector as drawers while preserving the list.

- [ ] **Step 4: Implement loading and empty states**

Use existing `Skeleton`, `EmptyState`, toast, and confirm-dialog patterns. Distinguish no work from no filter matches and request failure.

- [ ] **Step 5: Run web tests, lint, and build**

```bash
npm run test -w @promptix/web
npm run lint -w @promptix/web
npm run build -w @promptix/web
```

- [ ] **Step 6: Commit the governance workspace**

```bash
git add apps/web/src/pages/admin/TemplateGovernancePage.tsx apps/web/src/components/admin/governance apps/web/src/pages/AdminPage.tsx apps/web/test/template-governance-layout.test.ts
git commit -m "feat: build template governance workspace"
```

---

## Task 11: Add Approval, Reports, Rollback, and Rule Editing UI

**Files:**
- Create: `apps/web/src/components/admin/governance/GovernanceApprovalPanel.tsx`
- Create: `apps/web/src/components/admin/governance/GovernanceRulePanel.tsx`
- Modify: `apps/web/src/components/admin/governance/GovernanceInspector.tsx`
- Modify: `apps/web/src/pages/admin/TemplateGovernancePage.tsx`
- Modify: `apps/web/src/pages/AdminPage.tsx`
- Create: `apps/web/test/template-governance-approval.test.ts`

- [ ] **Step 1: Write failing approval UI tests**

Cover:

- plan view separates automatic, approval, conflict, skipped, and failed items;
- only changed fields are expanded by default;
- approval shows scope, rule-set version, representative diffs, exceptions, and rollback deadline;
- permanent delete requires typed confirmation and reason;
- published Prompt/variable changes cannot use automatic action controls;
- partial success report offers retry only for retryable failed items;
- rollback action is hidden for delete and disabled after deadline or conflict;
- stale rule/base version instructs the user to regenerate the plan;
- schedule and featured rules validate before save.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test apps/web/test/template-governance-approval.test.ts
```

- [ ] **Step 3: Implement plan review and execution reports**

Keep approval inside the right-side workspace rather than a one-line confirmation modal. Use the global confirm dialog only for the final destructive typed confirmation.

- [ ] **Step 4: Update legacy editor lifecycle actions**

The editor’s publish/archive/delete controls create or open a one-item governance change set and show `等待审批`, rather than assuming immediate mutation.

- [ ] **Step 5: Implement rule editing**

Expose schedule enable/cron/timezone, scan limit, confidence, auto-batch limit, rollback hours, featured slots/replacement ratio/cooldown, and optional output-type quotas. Saving creates a new rule-set version; it never mutates the rules referenced by historical runs.

- [ ] **Step 6: Run web tests and build**

```bash
npm run test -w @promptix/web
npm run build -w @promptix/web
```

- [ ] **Step 7: Commit governance decisions UI**

```bash
git add apps/web/src/components/admin/governance/GovernanceApprovalPanel.tsx apps/web/src/components/admin/governance/GovernanceRulePanel.tsx apps/web/src/components/admin/governance/GovernanceInspector.tsx apps/web/src/pages/admin/TemplateGovernancePage.tsx apps/web/src/pages/AdminPage.tsx apps/web/test/template-governance-approval.test.ts
git commit -m "feat: review template governance decisions"
```

---

## Task 12: End-to-End Verification, Migration Rehearsal, and Handoff

**Files:**
- Modify only files required by defects found during verification.
- Create: `docs/superpowers/runbooks/template-governance-operations.md`

- [ ] **Step 1: Run focused contract suites**

```bash
npm run test -w @promptix/shared
npm run test -w @promptix/api
npm run test -w @promptix/worker
npm run test -w @promptix/web
```

Expected: all suites PASS with zero failures.

- [ ] **Step 2: Run lint and production builds**

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Rehearse migration against a disposable database**

1. Restore a copy of the current schema/data.
2. Run `npm run db:migrate`.
3. Verify template counts and public template ordering are unchanged.
4. Verify every existing template has version 1.
5. Verify exactly one active default rule set exists.
6. Run the migration a second time and verify no duplicate seed/version rows.

- [ ] **Step 4: Verify the primary user journeys in the browser**

At a stable desktop viewport, capture and inspect:

1. queue-oriented default workspace;
2. filtered list with URL restoration after reload;
3. single-template preview and Agent explanation;
4. explicit and all-matching batch selection;
5. ad-hoc instruction preview before enqueue;
6. automatic metadata execution report;
7. featured adjustment inside and outside policy;
8. approval-gated publish/archive/delete;
9. partial failure and retry;
10. rollback and rollback conflict;
11. empty, filtered-empty, loading, offline, forbidden, and failed states.

Compare the implemented page with the selected “智能分拣台” visual direction and the current Promptix visual language. Fix visible hierarchy, spacing, clipping, typography, border, and responsive issues before claiming completion.

- [ ] **Step 5: Verify Agent/tool behavior directly**

Exercise the equivalent tool contracts:

```text
search_templates
inspect_template
validate_template
plan_changes
preview_changes
execute_auto_changes
submit_for_approval
get_change_set_status
rollback_change_set
```

Confirm pagination, field selection, invalid schemas, idempotent replay, stale versions, changed rule sets, and permission failures.

- [ ] **Step 6: Write the operations runbook**

Document:

- enabling/disabling and rescheduling patrols;
- inspecting runs and failed items;
- retry and rollback rules;
- rotating the governance prompt version;
- changing rule sets safely;
- recovering from Redis/model/database outages;
- monitoring queue age, auto completion, rejection, exception, and rollback metrics.

- [ ] **Step 7: Run the full repository verification again**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. Record actual test counts and any environment-dependent checks in the final handoff.

- [ ] **Step 8: Commit verification/runbook fixes**

```bash
git add <only files changed by this task> docs/superpowers/runbooks/template-governance-operations.md
git commit -m "docs: add template governance operations runbook"
```

## Completion Definition

Implementation is complete only when:

1. The three-column workspace is the default `/admin/templates` experience.
2. Queue counts and list predicates agree.
3. Agent planning produces validated, explainable proposals tied to base versions.
4. Approved automatic fields execute without approval only when current rules permit.
5. Featured changes stop for approval outside the configured limits.
6. Publish, archive, delete, Prompt skeleton, and variable changes cannot bypass approval.
7. All non-delete Agent mutations create immutable versions and audit events.
8. Idempotency, optimistic concurrency, partial failure, retry, and rollback are tested.
9. The daily scheduled patrol and ad-hoc instruction path both work.
10. The full test, lint, build, migration rehearsal, and browser verification evidence is fresh and recorded.
