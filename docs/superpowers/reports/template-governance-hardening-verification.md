# Template Governance Hardening Verification

Verified on 2026-07-22 in `F:\office_share\Promptix` on branch `main`.

## Result

The governance correctness hardening implementation passes the repository test, lint, build, fresh-database migration, and read-only browser checks described below. The implementation is ready for deployment-gate review, but it has not been rehearsed against a production-data clone and no owner-approved governance mutation canary has been submitted.

## Automated Verification

| Check | Result | Evidence |
|---|---|---|
| `npm test` | Passed, exit 0, 37.39 seconds | 195 tests: Shared 30, API 55, Worker 47, Web 63 |
| `npm run lint` | Passed, exit 0, 5.80 seconds | 8 existing React warnings; no errors |
| `npm run build` | Passed, exit 0, 38.81 seconds | Shared, Storage, Web, API, and Worker built successfully |
| `git diff --check` | Passed, exit 0 | No whitespace errors; Git only reported the configured LF-to-CRLF conversion notices |

The eight lint warnings are existing `react(only-export-components)` and `react-hooks(exhaustive-deps)` warnings in browse/context/provider/admin files outside the governance hardening changes. They do not fail the current lint command.

The Worker test output also includes the expected AI SDK compatibility warning for DeepSeek structured JSON output. It does not fail the suite.

## Runtime Warning

The verification environment uses Node.js `v22.0.0` and npm `10.5.1`. Vite 8.1.4 recommends Node.js `22.12+` on the Node 22 line. The production build succeeds on the current runtime, but CI and deployment should upgrade to Node.js 22.12 or later.

## Migration Rehearsal

All migrations, including `0014_governance_correctness_hardening.sql`, were applied successfully to a fresh disposable PostgreSQL 16 database. The rehearsal confirmed:

- `prompt_templates.deleted_at`, `deleted_by`, and `deletion_reason` exist;
- `template_governance_state` exists;
- `governance_operation_idempotency` exists;
- the complete migration sequence applies to an empty database without errors.

The disposable database/container was removed after verification.

This was a fresh-database rehearsal, not a production-data clone. It therefore does not prove production-shaped row counts, legacy mixed-set repair against real historical records, migration timing under production load, or rerun behavior over a copy of production data. Those checks remain rollout gates.

## Browser Verification

The signed-in administration UI was checked at `http://localhost:5173/admin/templates`:

- the page loaded successfully and displayed 14 templates;
- queue counts, filters, sort controls, and management actions rendered;
- selecting `质量优先` updated the URL to `/admin/templates?sort=quality_asc`;
- the sort control restored the `quality_asc` value from the URL;
- the browser console reported no errors.

This browser pass was intentionally read-only. No governance planning task, approval, rejection, retry, rollback, deletion, or other server-side mutation was submitted.

## Correctness Coverage

The automated suites cover the hardened contracts and implementation paths for homogeneous automatic/approval ChangeSets, canonical summaries and run rollup, snapshot V2 restoration, tombstones, cursor/query-scope stability, configured model resolution, scheduler state and leases, durable idempotency, atomic Worker claims, terminal queue filtering, and canonical UI status fields.

The migration test is a schema/source contract plus fresh PostgreSQL rehearsal. A full database-backed destructive end-to-end matrix with production-shaped fixtures was not executed in this workspace.

## Remaining Rollout Gates

Before enabling scheduled governance or broad batches in production:

1. Rehearse the migration on a recent sanitized production-data clone and compare template, version, proposal, item, and audit counts before and after.
2. Confirm legacy homogeneous and mixed ChangeSets are classified or superseded as intended, and rerun the migration rehearsal to verify idempotence.
3. Keep scheduled patrol disabled while migration repair is inspected.
4. Run one owner-approved manual canary over 3-5 templates, covering automatic and approval proposals without destructive deletion.
5. Validate approval rejection, conflict, retry, taxonomy rollback, tombstone evidence, duplicate delivery, and query-wide exclusion scenarios against the deployed database and queue.
6. Enable scheduling with `scanLimit <= 10` for the first 24 hours and review lease age, failures, conflicts, duplicate replays, approvals, and rollback results before increasing the limit.

## Final Worktree Check

Run after adding this report:

```powershell
git diff --check
git status --short
git diff --stat
```

No commit or push is part of this verification step.
