# Neon Persistence Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Hunter Pro HSG and trader data in the existing Neon database from local and Vercel deployments, with authentication and a safe migration path for browser data.

**Architecture:** Add a shared Node HTTP API and PostgreSQL repository used by both the local static server and Vercel serverless function entrypoints. Keep browser state/UI models intact behind an asynchronous persistence adapter, use signed password sessions and revision checks, and transactionally update exact state plus relational mirrors.

**Tech Stack:** Node.js 20+, JavaScript ES modules, PostgreSQL via `pg`, Neon pooled `DATABASE_URL`, Vercel Node.js Functions, browser `fetch` and `localStorage` recovery cache.

**Spec:** `docs/superpowers/specs/2026-09-23-neon-persistence-design.md`

## Global Constraints

- Keep all database and session secrets on the server; never put them in browser bundles or responses.
- Use the existing Neon project `Hunter Pro` and already applied migration `001`; do not point at Barber Hub.
- Preserve existing HSG, trader, CSV, backup, and snapshot behavior and all uncommitted work present before implementation.
- Do not delete local browser data before Neon acknowledges its import.
- Require explicit choice when both the browser and Neon already contain data.
- Preserve immutable snapshot behavior and prevent stale revisions from overwriting current state.
- Node.js runtime floor is 20; local app remains available through `npm start`.
- Never include credentials in logs, commits, docs, or client-visible errors.

## Review Focus

- Local data and server data both exist at first login: show counts and require an explicit source choice before writes.
- The server rejects a write based on an old revision and the browser retains the unsynced state.
- A snapshot already exists: synchronization never updates or deletes its database row.
- Neon is unavailable during an edit: show unsynced status and preserve data in the local recovery cache.
- Session cookie is absent, expired, or submitted from a different origin: deny the operation without disclosing secrets.

---

### Task 1: Shared PostgreSQL State Repository

**Files:**
- Create: `src/server/db.mjs`
- Create: `src/server/state-repository.mjs`
- Modify: `package.json`

**Interfaces:**
- `getPool()` returns the lazy singleton `pg.Pool` configured from `DATABASE_URL` with TLS enabled for Neon.
- `readArea(area)` returns `{ payload, revision }` or an empty payload at revision `0`.
- `writeArea(area, payload, expectedRevision)` transactionally stores exact payload, increments revision, mirrors supported records, and writes an audit entry; returns `{ revision }` or throws a typed conflict error.

- [ ] Add `pg` with `npm install pg`, commit the generated `package-lock.json`, and keep the runtime dependency limited to PostgreSQL connectivity.
- [ ] Implement lazy pool creation so static requests and auth-only paths do not open unnecessary database connections.
- [ ] Resolve the workspace ID by the existing `hunter-pro` slug with a parameterized query; fail with a safe configuration error if the migration is absent.
- [ ] Implement area validation for only `hsg` and `trader`; read `app_state` with its revision.
- [ ] Implement one transaction for revision-checked `app_state` upsert, area relational mirror, and `audit_log` insert.
- [ ] For HSG, mirror months/revisions/trades, historical bases/slots, snapshots, and OOS months while preserving IDs and JSON fields; insert snapshots once and never update/delete existing snapshots.
- [ ] For trader, mirror accounts, trades, and movements, preserving account references and external IDs; use safe upserts for editable records.
- [ ] On stale revision, rollback and return a typed conflict without changing any row.

### Task 2: Private Authentication and API Handler

**Files:**
- Create: `src/server/auth.mjs`
- Create: `src/server/api.mjs`
- Create: `src/server/password.mjs`
- Create: `scripts/hash-password.mjs`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- `handleApi(request, response)` handles `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, `GET /api/state/:area`, and `PUT /api/state/:area` for both runtimes.
- `verifySession(request)` returns the authenticated owner identity or `null`.
- `hashPassword(plaintext, salt?)` and `verifyPassword(plaintext, encodedHash)` use Node `scrypt` with a random salt and timing-safe comparison.

- [ ] Create password hash encoding as `scrypt$<salt-base64url>$<hash-base64url>` and provide a CLI helper that prints only the encoded hash.
- [ ] Sign short-lived, HTTP-only, same-site cookies with `SESSION_SECRET`; set `Secure` in production and verify signatures with constant-time comparison.
- [ ] Require JSON content type, bounded body size, valid area, allowed same-origin mutation requests, and a supported payload version.
- [ ] Add generic login failure responses and bounded per-process throttling; never log request bodies, passwords, cookies, or CSV data.
- [ ] Return safe distinct statuses for unauthenticated, invalid input, revision conflict, missing config/schema, and database unavailable cases.
- [ ] Add `.env.example` with names and placeholders only; maintain `.env` and secret-file ignore rules.

### Task 3: Local Server and Vercel Runtime Adapters

**Files:**
- Modify: `server.mjs`
- Create: `api/[...route].mjs`
- Create: `vercel.json`
- Modify: `package.json`

**Interfaces:**
- Local HTTP server dispatches `/api/*` to `handleApi` and serves existing assets for all other safe paths.
- Vercel catch-all function adapts request/response to the same `handleApi` implementation.

- [ ] Route local `/api/*` requests before static file resolution; reject unsupported methods and unsafe paths.
- [ ] Bind local server to `127.0.0.1` as before and keep port override behavior.
- [ ] Configure Vercel rewrites/runtime to route `/api/*` through the catch-all function while keeping existing static assets and SPA behavior intact.
- [ ] Add a local start command that loads `.env` when present under the supported Node 20 runtime without requiring a committed secret file.
- [ ] Confirm all relative imports and function entrypoints resolve in Vercel's Node runtime.

### Task 4: Browser Login, Load, Sync, and Local Migration

**Files:**
- Create: `src/persistence.mjs`
- Modify: `index.html`
- Modify: `src/app.mjs`
- Modify: `src/trader.mjs`
- Modify: `styles.css`

**Interfaces:**
- `initializePersistence()` checks session, loads remote revisions, and resolves to `{ authenticated, hsg, trader, migration }`.
- `saveArea(area, payload)` serializes per-area writes, uses the current expected revision, updates the revision only after acknowledgment, and preserves the latest payload locally on failure.
- `importLocalState(areas)` imports chosen local areas and clears migration prompts only after server acknowledgment.

- [ ] Add a login/setup screen that calls the session and login API before enabling sensitive app state.
- [ ] Load both remote areas during startup, normalize HSG state with existing logic, and initialize trader state from its current default model.
- [ ] Replace direct persistence calls with the adapter while retaining `hunter-hsg-state` and `hunter-trader-state` as local recovery caches.
- [ ] Serialize writes and surface saving, saved, conflict, offline, and authentication-expired states in the shared shell.
- [ ] Build a migration preview showing counts for HSG months, bases, slots, snapshots, audit entries, trader accounts, trades, and movements.
- [ ] When only local state exists, require explicit import; when both sides contain data, require choosing local import or Neon state. Do not merge ambiguous data automatically.
- [ ] Keep the browser copies until API acknowledgment and retain current HSG backup export/restore behavior.
- [ ] Keep CSV parsing entirely in the browser and send parsed state only.

### Task 5: Documentation, Environment Setup, and Production Connection

**Files:**
- Modify: `README.md`
- Create: `docs/operations/neon-vercel-setup.md`
- Local-only ignored file: `.env`
- Vercel project environment: `iasminmins-projects/hunter-pro`

**Interfaces:**
- Operations guide lists required variable names, how to create the owner password hash, configure local `.env`, configure Vercel Production secrets, migrate browser data, and recover from sync errors.

- [ ] Document the Neon pooled connection requirement and distinguish pooled runtime URL from direct migration URL.
- [ ] Configure local `DATABASE_URL`, `APP_PASSWORD_HASH`, and `SESSION_SECRET` without printing secrets to terminal output or committing `.env`.
- [ ] Configure the required variables in the correct Vercel Production environment; leave unrelated Barber Hub variables untouched. Preview remains unconfigured until it has an isolated Neon branch.
- [ ] Deploy the existing Hunter Pro project from its connected `main` branch after local integration is complete.
- [ ] Open production, authenticate, confirm Neon-backed startup and visible sync state, and confirm no secrets appear in browser source/network responses.
- [ ] Update README so it describes Neon persistence, login, local migration, backup recovery, and required setup accurately.

## Verification

- Do not add or run automated tests unless the user explicitly requests them.
- Manually inspect the API responses and database state through the app flow after credentials are configured.
- Verify login/logout, reload persistence, cross-browser state visibility, migration preview/import, stale revision conflict, offline recovery, and immutable snapshots in the local app.
- Verify Vercel production deployment, authenticated state load/save, function invocation, and that client bundles contain no database/session secrets.
- Review the final Git diff and confirm only intended files changed; preserve pre-existing modifications.
