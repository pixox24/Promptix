# Template Governance Correctness Hardening Implementation Plan

> **For implementation agents:** Execute this plan in order with strict red-green-refactor discipline. Do not combine unrelated tasks into one commit. Preserve unrelated worktree changes and stage only the files listed by the active task.

**Goal:** Repair the correctness gaps found in the AI Agent template-governance module so that automatic execution, approval, rejection, retry, rollback, pagination, captured selection, scheduled patrols, deletion evidence, and operational reporting all share one coherent and testable business model.

**Priority:** Tasks 1-4 are release blockers. Tasks 5-8 are required before enabling scheduled or large-batch governance in production. Tasks 9-11 complete the management and operational experience.

**Architecture:** Keep `AgentRun` as the user-visible planning operation, but partition proposals into independent automatic and approval ChangeSets. Make every ChangeSet homogeneous by execution mode. Centralize template snapshot capture and restoration so apply and rollback use the same field projection. Replace generic cursors with sort-specific seek cursors, pass captured selection scopes unchanged from the browser, use deterministic scheduler eligibility state, and preserve deletion evidence through tombstones plus retention-based purge.

**Tech Stack:** TypeScript, Zod, Hono, Drizzle ORM/PostgreSQL, BullMQ 5, React 19, React Router 7, Node test runner, oxlint.

**Source documents:**

- `docs/superpowers/specs/2026-07-21-ai-agent-template-management-design.md`
- `docs/superpowers/plans/2026-07-21-ai-agent-template-management.md`
- `docs/superpowers/runbooks/template-governance-operations.md`

---

## 1. Confirmed Defects and Target Decisions

### 1.1 Release-blocking defects

1. Mixed automatic and approval proposals share one ChangeSet. Automatic items change their template versions before approval, so approving the remaining items fails the all-proposal base-version check.
2. Rejecting a mixed ChangeSet leaves already-applied automatic changes in place while the ChangeSet becomes `rejected` and the run can remain `awaiting_approval`.
3. Semantic apply rebuilds taxonomy state, but rollback does not restore taxonomy assignments, output type, unmapped terms, confidence, or taxonomy review state.
4. Permanent delete cascades away proposal, item, and version evidence, so the run cannot later explain the deletion decision.

### 1.2 High-priority correctness defects

1. Pagination cursors only constrain `updated_desc`; the other advertised sorts can repeat the first page.
2. Query-wide selection captures a scope in state but reconstructs a different scope at submission time, losing exclusions and the original snapshot timestamp.
3. A configured governance model is only resolvable when it is also the global default text model.
4. `rollbackHours` is configurable but persistence always uses 168 hours.
5. Scheduled patrol uses an unordered `LIMIT`, has no eligibility watermark, and exposes disabled taxonomy terms.
6. Queue predicates and the inspector can treat terminal historical proposals as active work.
7. ChangeSet summary keys differ across shared schemas, persistence, execution, and UI.
8. Several idempotency paths are lookup-based or constraint-only and do not safely replay the original response under concurrency.

### 1.3 Approved target decisions for this repair

- One AgentRun may own multiple ChangeSets.
- Every ChangeSet has exactly one `executionMode`: `automatic` or `approval`.
- New mixed ChangeSets are forbidden by schema and service validation.
- Automatic execution never waits for, shares state with, or is rejected by an approval decision.
- Rejection affects only the approval ChangeSet. The run summary explicitly reports automatic items that were already applied.
- A run with applied automatic items and rejected approval items ends as `partially_succeeded`; a run with only rejected approval items ends as `cancelled`.
- Rollback is item-scoped internally and ChangeSet-scoped in the UI. It restores a complete canonical snapshot as a new forward version.
- Product-level permanent deletion becomes a tombstone immediately. Physical purge is a separate retention operation and does not remove governance audit evidence.
- Queue membership is derived from current template state plus the latest non-terminal governance item, never from unrestricted history.
- Every cursor is tied to one sort and one query fingerprint.
- Query-wide selection is an immutable server-resolved scope: captured query minus captured exclusions.

---

## 2. State Model and Invariants

### 2.1 AgentRun rollup

The run status is derived from all child ChangeSets and items; no route or Worker branch may invent its own rollup.

| Child state | Run status |
|---|---|
| Planning job queued/running | `queued` / `analyzing` |
| Automatic set planned or executing | `planned` / `auto_executing` |
| Automatic work complete and approval set pending | `awaiting_approval` |
| All executable items applied, no pending approval | `succeeded` |
| Some items applied and some failed, conflicted, or rejected | `partially_succeeded` |
| No item applied and execution failed | `failed` |
| Approval-only run rejected, or all remaining work cancelled | `cancelled` |

Create one pure function:

```ts
deriveGovernanceRunState(changeSets, items): {
  status: GovernanceRunStatus;
  progress: GovernanceRunProgress;
  stats: GovernanceRunStats;
  finishedAt: Date | null;
}
```

All planning, execution, approval, rejection, retry, rollback, and deletion paths call the same rollup function after their transaction commits.

### 2.2 ChangeSet invariants

- `executionMode='automatic'`: all items have `requiresApproval=false`; valid items may enter `pending`, `running`, `applied`, `failed`, `conflict`, `rolled_back`.
- `executionMode='approval'`: all items have `requiresApproval=true`; items begin `awaiting_approval` and cannot execute until the ChangeSet is `approved`.
- A Proposal belongs to one generated ChangeSet only.
- A ChangeSet cannot contain duplicate template IDs.
- Approval validates only approval-set items that are still awaiting approval.
- Retry selects only retryable `failed` items; version conflicts require a regenerated plan.
- Delete items are never rollbackable.

### 2.3 Canonical summary contract

Replace ad hoc `Record<string, number>` use with one shared schema:

```ts
{
  total: number;
  automatic: number;
  awaitingApproval: number;
  approved: number;
  applied: number;
  rejected: number;
  conflicts: number;
  skipped: number;
  failed: number;
  rolledBack: number;
  deleted: number;
}
```

Use these exact names in PostgreSQL JSON, API DTOs, Worker results, and UI. Do not retain singular aliases such as `approval` or `conflict` after the migration compatibility window.

### 2.4 Canonical template snapshot

Introduce snapshot schema version 2. It must contain every governance-mutable value needed for exact restoration:

- identity and version;
- name, summary, description, category, locale;
- prompt template, negative prompt, variables;
- workflow type, tags, output type;
- scenario/style/subject assignments with term ID, slug, dimension, source, and confidence;
- unmapped terms, classification confidence and metadata;
- taxonomy review status, reviewer, and reviewed timestamp;
- status, published timestamp, featured flag and order;
- cover object key and URL;
- source, source metadata, model hints, and i18n when these are mutable or required to explain state.

Legacy snapshots are parsed through `upgradeTemplateSnapshot()` and normalized to version 2 before diff, apply, or rollback.

---

## Task 0: Establish a Reproducible Baseline

**Priority:** P0 prerequisite

**Files:**

- Create: `docs/superpowers/reports/template-governance-hardening-baseline.md`
- Modify only if required to make existing commands reproducible.

- [ ] **Step 1: Record repository state**

```bash
git status --short
git branch --show-current
git log -1 --oneline
node --version
npm --version
```

Record unrelated dirty files and do not stage them later.

- [ ] **Step 2: Run the current verification suite**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Record exit codes, test counts, existing warnings, and runtime prerequisites.

- [ ] **Step 3: Add a disposable PostgreSQL integration-test entry point**

Use `TEST_DATABASE_URL` when supplied. Add a documented Docker command for local execution, but do not make ordinary unit tests depend on Docker.

The integration harness must:

1. create a fresh database;
2. apply all migrations;
3. seed only the minimum provider, model, admin, taxonomy, and template fixtures;
4. run the selected test file;
5. remove the database/container even after failure.

- [ ] **Step 4: Commit only the baseline harness/report**

```bash
git add docs/superpowers/reports/template-governance-hardening-baseline.md <integration-harness-files>
git commit -m "test: establish governance hardening baseline"
```

**Exit criteria:** Existing tests are green, the migration can run against a fresh database, and the implementation team has a repeatable database-backed test command.

---

## Task 1: Normalize Shared Contracts and Database Shape

**Priority:** P0

**Files:**

- Modify: `packages/shared/src/template-governance.ts`
- Modify: `packages/shared/test/template-governance.test.mjs`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0011_template_governance_hardening.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create/modify generated Drizzle snapshot metadata.
- Modify: `apps/worker/src/db.ts`
- Modify: `apps/web/src/types/templateGovernance.ts`
- Modify: `apps/api/test/template-governance-migration.test.mjs`

- [ ] **Step 1: Write failing shared-contract tests**

Cover:

- `executionMode` only accepts `automatic` or `approval`;
- canonical summary keys reject singular legacy keys in new writes;
- snapshot V2 round-trips all taxonomy and lifecycle fields;
- legacy V1 snapshots upgrade deterministically;
- automatic ChangeSets reject approval proposals and approval ChangeSets reject automatic proposals;
- run rollup produces the table in section 2.1.

- [ ] **Step 2: Write failing migration-contract tests**

Migration `0011` must:

- add `governance_change_sets.execution_mode`;
- add `prompt_templates.deleted_at`, `deleted_by`, and `deletion_reason`;
- add scheduler eligibility state, preferably a dedicated `template_governance_state` table;
- add durable operation-idempotency storage;
- add indexes required by queue reads, deletion filters, scheduler eligibility, and idempotency lookup;
- remain additive and avoid dropping historical governance rows.

- [ ] **Step 3: Implement backward-compatible schemas**

Read paths may accept legacy summary/snapshot data and normalize it. Every new write must emit canonical V2 data only.

- [ ] **Step 4: Classify existing ChangeSets during migration**

- terminal all-auto sets -> `automatic`;
- terminal all-approval sets -> `approval`;
- non-terminal homogeneous sets -> corresponding mode;
- mixed legacy sets -> mark as `legacy_mixed` only during migration repair, then split in Task 2 before application code removes compatibility support.

Do not silently execute or approve a mixed legacy set.

- [ ] **Step 5: Run focused tests**

```bash
npm run test -w @promptix/shared
npm run test -w @promptix/api
npm run build -w @promptix/worker
npm run build -w @promptix/web
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/template-governance.ts packages/shared/test/template-governance.test.mjs apps/api/src/db/schema.ts apps/api/drizzle/0011_template_governance_hardening.sql apps/api/drizzle/meta apps/worker/src/db.ts apps/web/src/types/templateGovernance.ts apps/api/test/template-governance-migration.test.mjs
git commit -m "fix: normalize template governance contracts"
```

**Exit criteria:** Shared contracts, DB schema, API, Worker, and Web agree on execution mode, summary keys, snapshot version, tombstone fields, and scheduler/idempotency records.

---

## Task 2: Split Automatic and Approval ChangeSets

**Priority:** P0 release blocker

**Files:**

- Modify: `apps/worker/src/governance-plan-persistence.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/api/src/lib/governance-service.ts`
- Modify: `apps/api/src/lib/governance-repository.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: `apps/api/src/routes/governance.ts`
- Create: `apps/worker/src/governance-run-state.ts`
- Create: `apps/worker/test/governance-plan-persistence.test.mjs`
- Modify: `apps/api/test/governance-service.test.mjs`
- Modify: `apps/worker/test/template-governance-executor.test.mjs`
- Add database-backed integration tests under `apps/api/test/integration` or the established integration-test location.

- [ ] **Step 1: Write the mixed-plan regression test**

Create one run containing:

- one high-confidence title update;
- one publish proposal requiring approval.

Assert:

1. planning creates two ChangeSets;
2. the automatic set executes and increments only its template version;
3. the approval set remains awaiting approval;
4. approval checks only the approval-set template base version;
5. publishing succeeds after approval;
6. the run ends `succeeded`.

- [ ] **Step 2: Write rejection and conflict tests**

- rejection does not alter the automatic set;
- auto-applied plus rejected approval rolls up to `partially_succeeded`;
- approval-only rejection rolls up to `cancelled`;
- an approval-item version conflict blocks only that approval item;
- an automatic-item failure does not corrupt the approval set;
- no new mixed ChangeSet can be persisted.

- [ ] **Step 3: Partition proposals atomically**

Within one planning transaction:

1. insert all validated Proposals;
2. partition by authoritative `requiresApproval`;
3. create zero or one automatic ChangeSet;
4. create zero or one approval ChangeSet;
5. insert items into the matching set;
6. compute canonical summaries;
7. set `rollbackUntil` from the referenced rule set;
8. append audit events identifying both generated sets.

The automatic ChangeSet idempotency key should be `run:{runId}:automatic:v2`; the approval key should be `run:{runId}:approval:v2`.

- [ ] **Step 4: Execute only the automatic ChangeSet after planning**

Do not call the executor with the approval set. Return both ChangeSet IDs in the generation-job result.

- [ ] **Step 5: Restrict approval/rejection transitions**

- approval and rejection require `executionMode='approval'`;
- approval validates only items still awaiting approval;
- approval changes those items to an executable state in the same transaction;
- rejection marks the approval items rejected and recalculates run state;
- automatic ChangeSets reject approve/reject API calls with `INVALID_EXECUTION_MODE`.

- [ ] **Step 6: Repair non-terminal legacy mixed sets**

Provide a one-time migration repair function or script that:

1. locks a mixed legacy set;
2. creates automatic and approval successors with deterministic idempotency keys;
3. moves or recreates item relationships without duplicating execution;
4. marks the original set `cancelled` with `supersededBy` IDs in audit payload;
5. never automatically executes an item previously awaiting approval.

- [ ] **Step 7: Verify**

```bash
npm run test -w @promptix/shared
npm run test -w @promptix/api
npm run test -w @promptix/worker
<governance database integration test command>
```

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/governance-plan-persistence.ts apps/worker/src/index.ts apps/worker/src/governance-run-state.ts apps/worker/test apps/api/src/lib/governance-service.ts apps/api/src/lib/governance-repository.ts apps/api/src/lib/governance-tools.ts apps/api/src/routes/governance.ts apps/api/test
git commit -m "fix: separate automatic and approval governance sets"
```

**Exit criteria:** Mixed plans complete end to end; automatic work cannot invalidate approval; rejection produces a terminal, truthful run state.

---

## Task 3: Centralize Snapshot Apply and Complete Rollback

**Priority:** P0 release blocker

**Files:**

- Create: `apps/worker/src/template-snapshot-projection.ts`
- Modify: `apps/worker/src/governance-job-execution.ts`
- Modify: `apps/api/src/lib/template-versioning.ts`
- Modify: `packages/shared/src/template-governance.ts`
- Modify: `apps/worker/test/template-governance-executor.test.mjs`
- Modify: `apps/api/test/template-versioning.test.mjs`
- Add database-backed rollback integration tests.

- [ ] **Step 1: Write failing round-trip tests**

Start with a template containing:

- output type;
- multiple scenario/style/subject assignments;
- assignment confidence and source;
- unmapped terms;
- classification metadata;
- `reviewed` taxonomy status and reviewer;
- published and featured state.

Apply a semantic proposal, then rollback. Assert every field and assignment equals the original snapshot except `currentVersion`, `updatedAt`, and the newly created rollback-version metadata.

- [ ] **Step 2: Implement canonical projection functions**

```ts
captureTemplateSnapshot(tx, templateId): Promise<TemplateVersionSnapshotV2>
mergeProposalIntoSnapshot(before, action, patch): TemplateVersionSnapshotV2
applyTemplateSnapshot(tx, templateId, expectedVersion, snapshot, metadata): Promise<ApplyResult>
diffTemplateSnapshots(before, after): GovernanceDiff
```

`applyTemplateSnapshot` owns all column updates and taxonomy-assignment replacement. Manual versioning and Agent execution should share capture/diff behavior where practical.

- [ ] **Step 3: Replace executor field lists**

Remove the partial `mutationPatch()`/manual rollback projection as the source of truth. Action-specific logic should produce a target snapshot; one projection function applies it.

- [ ] **Step 4: Harden rollback transactions**

For each item:

1. verify rollback deadline;
2. verify item action is rollbackable;
3. compare current version with `appliedVersion`;
4. restore the normalized before snapshot;
5. create version `current+1` with source `rollback`;
6. preserve original run, ChangeSet, Proposal, and applied-version references;
7. record precise conflict/failure status per item.

Do not mark an entire ChangeSet rolled back if one applied item conflicts. Use `partially_succeeded` plus item results.

- [ ] **Step 5: Use configured rollback duration**

Read `rules.rollbackHours` during ChangeSet creation. Store the computed deadline once; later rule changes must not alter historical deadlines.

- [ ] **Step 6: Verify**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
<governance rollback integration test command>
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/template-governance.ts apps/api/src/lib/template-versioning.ts apps/api/test/template-versioning.test.mjs apps/worker/src/template-snapshot-projection.ts apps/worker/src/governance-job-execution.ts apps/worker/test
git commit -m "fix: restore complete template snapshots on rollback"
```

**Exit criteria:** Every supported mutation can be applied and restored through the same projection, including semantic taxonomy state.

---

## Task 4: Preserve Deletion Evidence with Tombstones

**Priority:** P0/P1 boundary

**Files:**

- Modify: `apps/worker/src/governance-job-execution.ts`
- Modify: `apps/api/src/lib/governance-query.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: public/admin template read routes that must hide deleted records.
- Modify: `apps/api/src/routes/templates.ts`
- Create: `apps/api/src/lib/template-retention.ts`
- Add deletion integration tests.
- Modify: `docs/superpowers/runbooks/template-governance-operations.md`

- [ ] **Step 1: Write deletion evidence tests**

After approved deletion:

- public and ordinary admin lists cannot return the template;
- the governance run still returns Proposal, ChangeSetItem, Approval, audit events, and before snapshot;
- the template row is tombstoned with actor, timestamp, and reason;
- repeated execution returns the original deletion outcome;
- rollback remains unavailable;
- direct reads return `404` or a governance-only tombstone projection according to route role.

- [ ] **Step 2: Replace physical delete in the executor**

Update the template using optimistic version matching:

```text
deleted_at = now
deleted_by = approving administrator
deletion_reason = approved reason
current_version = current_version + 1
```

Create a deletion version/audit record. Do not delete Proposal, ChangeSetItem, TemplateVersion, or Approval rows.

- [ ] **Step 3: Add one shared active-template predicate**

All public queries, template editors, governance queues, featured ranking, similar-template lookup, and scheduler selection must use `deleted_at IS NULL` unless explicitly requesting tombstones for audit.

- [ ] **Step 4: Add retention-based physical purge**

The purge function must be owner-only or offline-operator-only, default to dry-run, enforce a configurable retention period, and preserve immutable governance audit events in a non-cascading form. It must not be exposed as a normal template-management button.

- [ ] **Step 5: Verify and commit**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
<governance deletion integration test command>
git add apps packages docs/superpowers/runbooks/template-governance-operations.md
git commit -m "fix: preserve governance evidence for deleted templates"
```

**Exit criteria:** Deletion is immediately effective for product users while governance evidence remains inspectable and auditable.

---

## Task 5: Repair Captured Selection and Sort-Specific Pagination

**Priority:** P1

**Files:**

- Modify: `packages/shared/src/template-governance.ts`
- Modify: `apps/api/src/lib/governance-query.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: `apps/api/src/lib/governance-run-preparation.ts`
- Modify: `apps/web/src/lib/templateGovernanceState.ts`
- Modify: `apps/web/src/hooks/useTemplateGovernance.ts`
- Modify: `apps/web/src/pages/admin/TemplateGovernancePage.tsx`
- Modify: `apps/api/test/governance-query.test.mjs`
- Modify: `apps/web/test/template-governance-state.test.ts`
- Add database-backed pagination tests.

- [ ] **Step 1: Write pagination regression tests**

Seed enough rows to cross page boundaries with tied values. For every sort:

- `updated_desc`;
- `updated_asc`;
- `quality_asc`;
- `confidence_desc`;

Assert no duplicate or missing IDs while walking all pages. Assert a cursor generated for one sort or query is rejected for another.

- [ ] **Step 2: Introduce a discriminated cursor**

```ts
type GovernanceCursor =
  | { sort: 'updated_desc' | 'updated_asc'; updatedAt: string; id: string; queryHash: string }
  | { sort: 'quality_asc'; qualityRank: number; id: string; queryHash: string }
  | { sort: 'confidence_desc'; confidence: number; id: string; queryHash: string };
```

Build the ordering expression once and reuse it in `ORDER BY`, cursor projection, and seek predicate.

- [ ] **Step 3: Pass query-wide selection unchanged**

In `TemplateGovernancePage.submit`, use:

```ts
scope: controller.selection.mode === 'query'
  ? controller.selection
  : explicitSelectionOrCurrentCapturedQuery(...)
```

Do not generate a replacement timestamp or discard exclusions.

- [ ] **Step 4: Resolve and audit the captured scope server-side**

Store:

- original query;
- snapshot timestamp;
- exclusions;
- resolved template count;
- resolved template ID hash;
- truncation flag and scan limit.

If matching rows exceed the allowed planning limit, return a preview requiring explicit narrowing or an approved bounded-batch strategy. Never silently process only the first page while claiming the full count.

- [ ] **Step 5: Add exclusion interaction**

When selection mode is query-wide, toggling a row adds/removes that ID from `exclusions`; it must not collapse selection back to explicit mode.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -w @promptix/shared
npm run test -w @promptix/api
npm run test -w @promptix/web
<pagination integration test command>
git add packages/shared/src/template-governance.ts apps/api/src/lib/governance-query.ts apps/api/src/lib/governance-tools.ts apps/api/src/lib/governance-run-preparation.ts apps/api/test apps/web/src/lib/templateGovernanceState.ts apps/web/src/hooks/useTemplateGovernance.ts apps/web/src/pages/admin/TemplateGovernancePage.tsx apps/web/test/template-governance-state.test.ts
git commit -m "fix: stabilize governance selection and pagination"
```

**Exit criteria:** All advertised sorts paginate correctly, and the task scope exactly matches what the administrator confirmed.

---

## Task 6: Unify Governance Model Resolution

**Priority:** P1

**Files:**

- Modify: `apps/api/src/lib/governance-run-preparation.ts`
- Modify: `apps/api/src/routes/governance.ts`
- Modify: `apps/worker/src/model-resolver.ts`
- Modify: `apps/worker/src/index.ts`
- Create or modify shared model-selection tests.
- Add an API/Worker integration test for a non-default configured model.

- [ ] **Step 1: Write the failing configured-model test**

Seed:

- one default structured-output text model A;
- one enabled, non-default structured-output text model B;
- active rules selecting B.

Assert both manual and scheduled governance runs resolve B and persist B's model ID.

- [ ] **Step 2: Define one selection rule**

1. If `rules.agent.modelId` is set, resolve that exact enabled model and provider.
2. Otherwise resolve the enabled default text model.
3. Require both `text` and `structured_output` capabilities.
4. Return stable error codes for missing, disabled, provider-disabled, or incompatible models.

The API preparation and Worker scheduler must use equivalent code or a shared repository helper; they must not maintain different SQL filters.

- [ ] **Step 3: Remove repeated capability parsing**

Parse capabilities once per candidate and return a typed resolved model.

- [ ] **Step 4: Verify and commit**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
git add apps/api/src/lib/governance-run-preparation.ts apps/api/src/routes/governance.ts apps/worker/src/model-resolver.ts apps/worker/src/index.ts apps/api/test apps/worker/test
git commit -m "fix: resolve configured governance models consistently"
```

**Exit criteria:** Any model accepted by Agent settings can be used by both manual and scheduled governance runs.

---

## Task 7: Make Scheduled Patrol Deterministic and Fair

**Priority:** P1 before enabling schedules

**Files:**

- Modify: `apps/worker/src/scheduled-governance.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/api/src/lib/governance-scheduler.ts`
- Modify: scheduler state schema introduced in Task 1.
- Modify: `apps/api/test/governance-scheduler.test.mjs`
- Create: `apps/worker/test/scheduled-governance.test.mjs`
- Add scheduler integration tests.

- [ ] **Step 1: Define eligibility**

A non-deleted template is eligible when any condition is true:

- it has never been checked;
- `currentVersion > lastCheckedVersion`;
- its previous check failed and `nextEligibleAt <= now`;
- a configured full-rescan interval has elapsed.

Order by:

1. never checked first;
2. oldest `lastCheckedAt`;
3. oldest `updatedAt`;
4. template ID as stable tiebreaker.

- [ ] **Step 2: Add lease protection**

Scheduled workers must claim eligible templates transactionally with a bounded lease. Multiple Worker replicas cannot plan the same template concurrently. Expired leases become eligible again.

- [ ] **Step 3: Mark outcomes**

After planning:

- update `lastCheckedVersion` and `lastCheckedAt` for successful inspections, including no-proposal results;
- store last run/proposal IDs;
- increase failure count and calculate bounded backoff for failures;
- clear the lease in every terminal path.

- [ ] **Step 4: Use only enabled taxonomy terms**

Manual and scheduled inputs must build the same enabled taxonomy catalog, including `id`, `slug`, `dimension`, and label where useful. Execution revalidates term existence and eligibility.

- [ ] **Step 5: Preserve actual scope evidence**

The scheduled AgentRun scope must contain the IDs/hash actually claimed, not a generic query unrelated to Worker selection.

- [ ] **Step 6: Verify fairness**

With `scanLimit=2` and five templates, three consecutive successful patrols must cover all five before returning to the first template unless one changes version.

- [ ] **Step 7: Verify and commit**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
<scheduler integration test command>
git add apps/api/src/lib/governance-scheduler.ts apps/api/test/governance-scheduler.test.mjs apps/worker/src/scheduled-governance.ts apps/worker/src/index.ts apps/worker/test
git commit -m "fix: patrol templates deterministically"
```

**Exit criteria:** Scheduled patrols do not starve templates, duplicate leases, or recommend disabled taxonomy terms.

---

## Task 8: Make Idempotency and Worker Execution Durable

**Priority:** P1

**Files:**

- Modify: `apps/api/src/lib/governance-repository.ts`
- Modify: `apps/api/src/lib/governance-service.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: `apps/api/src/routes/governance.ts`
- Modify: `apps/worker/src/governance-job-execution.ts`
- Modify operation-idempotency schema from Task 1.
- Add API and Worker concurrency integration tests.

- [ ] **Step 1: Define operation identity**

Use the tuple:

```text
actorId + operation + targetType + targetId + idempotencyKey
```

Persist request hash, state (`processing`, `succeeded`, `failed`), response JSON, and timestamps. Reusing a key with a different request hash returns `IDEMPOTENCY_KEY_REUSED`.

- [ ] **Step 2: Protect every mutation**

Cover:

- run creation;
- ChangeSet creation/submission;
- approve/reject;
- retry;
- rollback;
- executor item application;
- tombstone deletion.

- [ ] **Step 3: Make replay responses truthful**

A replay returns the originally persisted status/result, not the caller's desired target status. A second approve call cannot claim approval if the original operation was reject.

- [ ] **Step 4: Add Worker item claims**

Transition an item to `running` with an atomic compare-and-set before mutation. A duplicate Worker delivery skips completed items and resumes only safely retryable work. Audit start/finish events must not be duplicated for a replay.

- [ ] **Step 5: Test concurrent calls**

Issue two concurrent requests with the same key and two with different keys. Assert exactly one template version increment, one approval decision, and one terminal audit outcome.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -w @promptix/api
npm run test -w @promptix/worker
<idempotency integration test command>
git add apps/api apps/worker packages/shared
git commit -m "fix: make governance operations idempotent"
```

**Exit criteria:** HTTP retries and BullMQ redelivery cannot duplicate a decision, mutation, version, or audit outcome.

---

## Task 9: Clean Queue Semantics and Read Models

**Priority:** P2

**Files:**

- Modify: `apps/api/src/lib/governance-query.ts`
- Modify: `apps/api/src/lib/governance-tools.ts`
- Modify: `apps/api/src/routes/governance.ts`
- Modify: `apps/api/test/governance-query.test.mjs`
- Add database-backed queue/read-model tests.

- [ ] **Step 1: Define active work once**

Create one reusable predicate/view for the latest non-terminal Proposal/Item per template. Terminal statuses such as `rejected`, `applied`, `rolled_back`, `cancelled`, and superseded legacy records do not count as current work.

- [ ] **Step 2: Correct queue definitions**

- `taxonomy_confirmation`: current template taxonomy state requires review.
- `duplicate_candidates`: latest active proposal has an unresolved duplicate signal.
- `quality_issues`: deterministic current quality signal is unresolved.
- `featured_candidates`: active candidate signal meets minimum policy inputs, not every published unfeatured template.
- `pending_approval`: an approval-set item is currently awaiting approval.
- `failed_items`: latest executable item is failed or conflicted and not superseded.

- [ ] **Step 3: Correct inspector terminology**

Return separate fields:

```text
activeProposal
latestProposal
latestDecision
latestAppliedChange
```

Do not label a rejected or rolled-back historical Proposal as active.

- [ ] **Step 4: Consolidate queue counts**

Replace six count-plus-row searches with one aggregate query or materialized read model using exactly the same predicates as list queries. Read counts and first page from a consistent database snapshot where practical.

- [ ] **Step 5: Add performance evidence**

Run `EXPLAIN ANALYZE` on representative queue/list queries with production-like row counts. Add or revise indexes only from measured plans.

- [ ] **Step 6: Verify and commit**

```bash
npm run test -w @promptix/api
<queue integration test command>
git add apps/api/src/lib/governance-query.ts apps/api/src/lib/governance-tools.ts apps/api/src/routes/governance.ts apps/api/test
git commit -m "fix: show only current governance work"
```

**Exit criteria:** Queue counts equal list counts, completed work leaves active queues, and the inspector distinguishes current work from history.

---

## Task 10: Align the Management UI with the Corrected Model

**Priority:** P2

**Files:**

- Modify: `apps/web/src/types/templateGovernance.ts`
- Modify: `apps/web/src/data/templateGovernanceApi.ts`
- Modify: `apps/web/src/hooks/useTemplateGovernance.ts`
- Modify: `apps/web/src/pages/admin/TemplateGovernancePage.tsx`
- Modify: `apps/web/src/components/admin/governance/GovernanceInspector.tsx`
- Modify: `apps/web/src/components/admin/governance/GovernanceApprovalPanel.tsx`
- Modify: `apps/web/src/components/admin/governance/GovernanceRunCenter.tsx`
- Modify: `apps/web/src/components/admin/governance/GovernanceBulkBar.tsx`
- Modify relevant web tests.

- [ ] **Step 1: Present automatic and approval sets separately**

The run view shows:

- automatic changes and their execution results;
- approval-required changes and their pending decision;
- rejected items;
- conflicts/failures;
- rollback availability per set.

Never show one approval button as if it controls already-applied automatic items.

- [ ] **Step 2: Show exact scope before submission**

Preview includes:

- current query label;
- captured timestamp;
- total matches;
- exclusions;
- scan limit/truncation;
- whether one or multiple bounded runs will be needed.

- [ ] **Step 3: Replace raw JSON as the primary diff**

Show field-level before/after rows first. Keep raw JSON under an advanced disclosure. For taxonomy, group output type, scenarios, styles, subjects, tags, unmapped terms, and review status.

- [ ] **Step 4: Improve status truthfulness**

- display canonical summary keys;
- distinguish `rejected`, `cancelled`, `partially_succeeded`, `conflict`, and `failed`;
- refresh list, queues, inspector, run center, and metrics after every mutation;
- poll only active runs/sets;
- expose the original error code and actionable recovery.

- [ ] **Step 5: Confirm dangerous operations**

Deletion approval displays the retained audit policy and non-rollbackable nature. Physical purge is absent from the normal UI.

- [ ] **Step 6: Responsive and accessibility checks**

- keyboard-accessible table selection and inspector actions;
- visible focus states;
- status not conveyed by color alone;
- drawers for queue and inspector on narrow screens;
- no action or translated text clipping at supported widths.

- [ ] **Step 7: Verify and commit**

```bash
npm run test -w @promptix/web
npm run lint -w @promptix/web
npm run build -w @promptix/web
git add apps/web
git commit -m "fix: align governance UI with execution state"
```

**Exit criteria:** The administrator can understand what already happened, what still needs approval, what failed, and what can be rolled back without interpreting raw state records.

---

## Task 11: End-to-End Verification, Rollout, and Runbook Update

**Priority:** Required for completion

**Files:**

- Modify: `docs/superpowers/runbooks/template-governance-operations.md`
- Create: `docs/superpowers/reports/template-governance-hardening-verification.md`
- Modify only implementation files required by defects found during verification.

- [ ] **Step 1: Run all automated verification**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Record exact test counts, duration, warnings, and exit codes.

- [ ] **Step 2: Rehearse migration on production-shaped data**

Verify:

1. template counts before/after;
2. all existing snapshots remain readable;
3. active rule set remains unique;
4. homogeneous ChangeSets receive the correct execution mode;
5. mixed non-terminal sets are safely superseded;
6. no tombstoned template appears in product queries;
7. scheduler eligibility rows are initialized without triggering an unbounded run;
8. migration rerun does not duplicate seeds or repairs.

- [ ] **Step 3: Exercise mandatory end-to-end scenarios**

1. automatic-only metadata run;
2. approval-only publish run;
3. mixed plan partitioned into two sets;
4. mixed plan with approval rejection;
5. automatic partial failure and retry;
6. approval base-version conflict;
7. taxonomy apply and exact rollback;
8. rollback conflict after a manual edit;
9. tombstone deletion with preserved evidence;
10. every sort across multiple pages;
11. query-wide selection with exclusions and delayed submission;
12. configured non-default Agent model;
13. three scheduled patrols proving fair coverage;
14. duplicate HTTP requests and BullMQ redelivery.

- [ ] **Step 4: Browser verification**

At desktop and mobile widths, verify:

- queue counts/list agreement;
- selection-scope preview;
- separate automatic and approval sections;
- approval and rejection results;
- field-level taxonomy diff;
- partial success, retry, rollback, and tombstone states;
- empty, loading, offline, forbidden, conflict, and failed states;
- URL restoration for filters, sort, cursor, selected item, and selection mode.

- [ ] **Step 5: Update operations documentation**

Document:

- new execution-mode semantics;
- run rollup rules;
- tombstone retention and purge procedure;
- scheduler eligibility/lease recovery;
- idempotency diagnostics;
- safe rule and model changes;
- alerts for queue age, lease age, failure rate, conflict rate, approval age, rollback rate, and purge backlog.

- [ ] **Step 6: Rollout gates**

1. Deploy schema and backward-compatible reads first.
2. Keep scheduled patrol disabled during migration repair.
3. Deploy API and Worker with new partition/executor behavior.
4. Run one owner-approved manual canary over 3-5 templates.
5. Enable schedule with `scanLimit <= 10` for the first 24 hours.
6. Review conflicts, rejections, duplicate deliveries, and rollback results.
7. Increase to the intended scan limit only after metrics remain within agreed thresholds.

- [ ] **Step 7: Final commit**

```bash
git add docs/superpowers/runbooks/template-governance-operations.md docs/superpowers/reports/template-governance-hardening-verification.md <verified-fix-files>
git commit -m "docs: verify template governance hardening"
```

---

## 3. Required Test Matrix

| Layer | Required coverage |
|---|---|
| Shared unit | schemas, V1-to-V2 snapshot upgrade, summary normalization, risk classification, run rollup |
| API unit | state-transition guards, scope capture, cursor parsing, model selection, idempotency replay |
| Worker unit | proposal partitioning, item claims, apply projection, rollback projection, retry selection, scheduler eligibility |
| PostgreSQL integration | optimistic concurrency, taxonomy assignments, mixed-plan approval, rollback, tombstone evidence, queue counts, pagination |
| BullMQ integration | duplicate delivery, failed enqueue, retry, scheduler lease recovery |
| Web unit | URL/selection state, query-wide exclusions, canonical summaries, approval/rejection controls |
| Browser E2E | primary workflows, error states, responsive layout, reload restoration |

Source-text regular-expression tests may remain as lightweight contract checks, but they do not satisfy database, state-transition, or browser acceptance criteria.

---

## 4. Observability Requirements

Add structured logs and metrics with `runId`, `changeSetId`, `proposalId`, `itemId`, and `templateId` where applicable.

Required metrics:

- run duration by trigger and terminal status;
- planning input/output counts;
- automatic versus approval proposal counts;
- approval age and decision rate;
- applied, rejected, failed, conflicted, retried, rolled-back, and deleted item counts;
- duplicate delivery/idempotent replay count;
- scheduler eligible, leased, checked, skipped, and failed counts;
- oldest scheduler lease and oldest pending approval;
- queue-count/list-count mismatch detector;
- rollback conflict rate;
- tombstone purge backlog.

Never log Prompt contents, provider credentials, or full model responses in ordinary application logs. Keep sensitive snapshots in protected audit storage and return only authorized projections.

---

## 5. Definition of Done

The repair is complete only when all conditions are true:

1. A mixed Agent plan produces separate automatic and approval ChangeSets.
2. Automatic execution cannot invalidate or be rejected by an approval decision.
3. Run status is derived consistently after plan, apply, approve, reject, retry, rollback, and delete.
4. Apply and rollback round-trip every governance-mutable field and taxonomy assignment.
5. Configured rollback duration is honored per ChangeSet.
6. Deleted templates disappear from product behavior while governance evidence remains inspectable.
7. Every advertised sort paginates without duplicates or omissions.
8. Query-wide selection executes exactly the captured scope minus exclusions.
9. Any model accepted by Agent settings works for manual and scheduled runs.
10. Scheduled patrols are deterministic, leased, fair, and restricted to enabled taxonomy.
11. Active queues exclude terminal historical work and counts match list results.
12. Canonical summary names are consistent from DB through UI.
13. Concurrent retries and queue redelivery cannot duplicate mutations or decisions.
14. Database-backed integration tests cover the critical state transitions.
15. Full test, lint, build, migration rehearsal, and browser verification evidence is fresh and documented.

---

## 6. Recommended Commit Sequence

1. `test: establish governance hardening baseline`
2. `fix: normalize template governance contracts`
3. `fix: separate automatic and approval governance sets`
4. `fix: restore complete template snapshots on rollback`
5. `fix: preserve governance evidence for deleted templates`
6. `fix: stabilize governance selection and pagination`
7. `fix: resolve configured governance models consistently`
8. `fix: patrol templates deterministically`
9. `fix: make governance operations idempotent`
10. `fix: show only current governance work`
11. `fix: align governance UI with execution state`
12. `docs: verify template governance hardening`

Do not squash these commits until migration rehearsal and rollback verification are complete; the separation makes deployment review and selective rollback safer.
