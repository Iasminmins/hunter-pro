# SDD ledger — plan: docs/superpowers/plans/2026-09-23-performance-lab.md

## Rulings

- Ruling: Work stayed in the authorized `C:\Hunter Pro` checkout after the managed worktree was created outside the writable roots — this preserves access to the approved, uncommitted design and plan files without requesting another filesystem escalation — cost if wrong: implementation edits are in the shared `main` working tree instead of an isolated branch.
- Ruling: Automated tests and test files are omitted — a higher-priority session instruction prohibits adding or running tests unless the user explicitly requests verification — cost if wrong: CSV parsing and simulation behavior have not been executed against fixtures.
- Ruling: The Neon migration is versioned in the repository but not applied remotely — applying database changes requires explicit confirmation under the Neon migration tool instructions — cost if wrong: remote Performance Lab saves will fail until migration `002_performance_area.sql` is applied.

## Interface pre-flight

- Task 1 → Task 3: `saveArea('performance', payload)`, remote initialization and conflict handling support a separate area; the renderer owns only the Performance Lab payload.
- Task 2 → Task 3: CSV parser, import preview, metric summary, evaluation simulation and withdrawal estimate exports match the renderer imports.

## Progress

- Task 1: implemented client/server area allowlists and local state handling; added migrations `001` and `002` support.
- Task 2: implemented summary/Grid parsing, duplicate and period warnings, metrics, evaluation and withdrawal calculations.
- Task 3: implemented navigation, Performance Lab tabs, import preview/confirmation, configurable profiles, charts and responsive styling.
- Task 4: README updated; an independent static review identified import, parser, timezone and breach-traceability issues; fixes were applied.
- Production incident: GET `/api/state/performance` returned 404 because `api/state/performance.mjs` was missing. Added the handler, deployed production `2gcWgtUSpQrSmtvPft1Ct9av1izS`, and verified the route now returns the expected 401 while unauthenticated; `/api/auth/session` returns 200.
- Migration `002_performance_area.sql` was applied on the Neon Hunter Pro production branch and the SQL editor reported success.
- Verification: `git diff --check` and Node syntax checks passed. Automated tests and an authenticated browser workflow were not performed.
