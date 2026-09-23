# Neon Persistence and Vercel Integration Design

## Goal

Make Hunter Pro persist HSG and trader data in the existing Neon PostgreSQL project, with the same behavior in the local Node server and the existing Vercel project, while preserving data currently stored in each browser.

## Current State and Constraints

- The app is a static browser application. `src/app.mjs` stores HSG state under `hunter-hsg-state`; `src/trader.mjs` stores trader state under `hunter-trader-state`.
- `server.mjs` serves static files only. There is no authentication or backend API.
- The Neon project `Hunter Pro` already has `migrations/001_hunter_pro_init.sql` applied. `app_state` supports exact JSON state; relational tables support HSG and trader records, and snapshots are immutable.
- The Vercel project is `iasminmins-projects/hunter-pro`, connected to `Iasminmins/hunter-pro` on `main`, with production domain `hunter-pro.vercel.app`.
- Database and session secrets must remain server-side. Existing feature work and local browser data must be preserved.

## Selected Approach

Add a small shared Node API backed by PostgreSQL. The local server will serve the current assets and API; Vercel will route `/api/*` to the same API modules through serverless handlers. Use the `pg` driver and the existing schema rather than moving the frontend to a new framework or exposing a database connection from browser code.

Protect all state endpoints with a single-owner password configured through environment variables. Successful login creates a signed, HTTP-only, same-site session cookie; mutation routes validate origin/CSRF, request size, and payload shape. Production requires secure cookies and HTTPS. Apply bounded login throttling and return generic authentication errors.

## Data Flow and Migration

After authentication, the client loads HSG and trader payloads from `app_state` and initializes existing renderers with those payloads. Writes are serialized per area and include the revision last read. The server rejects stale revisions with a conflict response, preventing one browser tab from silently overwriting another. Each accepted write updates the complete `app_state` payload, its revision and timestamp, and the corresponding relational rows in one database transaction; an audit row records the operation without logging secrets or CSV contents.

On first connection, the client compares local browser state with the server state. If server state is empty and local state exists, show a preview with HSG and trader record counts and offer an explicit import. Import both areas transactionally where possible, preserve IDs and immutable snapshots, and retain the browser copy until the server confirms success. If both sides have data, require an explicit choice to import local data or keep the server version; never silently replace either. After migration, Neon is authoritative; retain local storage as a recoverable cache and keep existing JSON backup/restore flows.

CSV files continue to be parsed in the browser. Only validated parsed records and state payloads are sent to the API. Network errors keep edits recoverable locally, show a visible unsynced state, and retry queued writes in order. Do not report a save as complete until the server acknowledges it.

## API and Configuration

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` manage the private session.
- `GET /api/state/:area` loads one area and its revision; `PUT /api/state/:area` saves it with optimistic concurrency.
- Local configuration uses `DATABASE_URL`, `APP_PASSWORD_HASH`, and `SESSION_SECRET` from an ignored `.env` file or environment.
- Vercel production and preview require the same server-only variables, with production cookie settings enabled. No secrets are committed, returned to the client, or written to logs.
- Startup/API checks fail clearly when required configuration is absent; static pages may still load a useful setup/error screen without exposing internals.

## Error Handling and Security

Validate area names, JSON shape, payload byte size, and supported state version before database writes. Use parameterized SQL and transactions for the full payload plus relational mirror. Map unauthenticated, stale revision, invalid payload, and database unavailable conditions to distinct safe HTTP statuses and actionable client messages. A failed save remains locally recoverable and visibly unsynced. Do not use public anonymous database access.

## Scope and Completion Criteria

1. Local and Vercel-hosted app code use the same authenticated Neon API.
2. HSG months, historical bases, snapshots, OOS data, trader accounts, trades, and movements survive refresh and appear across authenticated browsers.
3. Existing local data has a previewed, explicit migration path and is not removed before successful server acknowledgment.
4. Stale tabs cannot silently overwrite newer state; snapshots remain immutable.
5. Missing secrets, expired sessions, offline writes, and database errors are visible and preserve recoverable work.
6. Vercel production configuration is set without exposing secrets, and the Hunter Pro project deploys from its connected `main` branch.

## Out of Scope

Multi-user authorization, public sign-up, role management, changing the Neon schema beyond migration `001`, replacing the frontend framework, and uploading raw CSV files.
