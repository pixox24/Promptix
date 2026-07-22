# Template Governance Hardening Baseline

Captured on 2026-07-22 in `F:\office_share\Promptix`.

- Branch: `main`
- Baseline commit: `4f593f9 docs: add template governance admin guide`
- Node.js: `v22.0.0`
- npm: `10.5.1`
- Initial unrelated worktree changes: none; the hardening plan was the only untracked file.

## Verification

The focused shared, API, and Worker suites passed before the later hardening stages. All package builds also passed. Final root-level test, lint, build, migration rehearsal, and diff checks are recorded in the implementation handoff after the completed changes.

Vite reports that Node.js 22.0.0 is below its supported 22.x floor of 22.12.0. The production build currently completes, but CI and production should use Node.js 22.12 or later.

## Database Rehearsal

Use a disposable PostgreSQL database and set `TEST_DATABASE_URL` before applying all files in `apps/api/drizzle` in journal order. The rehearsal must verify migration `0014_governance_correctness_hardening.sql`, then discard the database. Ordinary unit tests remain database-independent.
