# Neon and Vercel setup

## Local server

1. Install dependencies with `npm install` and copy `.env.example` to `.env` when it does not exist.
2. Run `npm run generate-local-secrets`. This creates a random owner password in `APP_PASSWORD`, its scrypt hash in `APP_PASSWORD_HASH`, and a random `SESSION_SECRET` in ignored `.env`.
3. In Neon Console, select the Hunter Pro production branch and `neondb`, enable the pooled connection option, copy its PostgreSQL URL, and set it as `DATABASE_URL`. Keep `sslmode=require` or the equivalent TLS option.
4. Start with `npm start`, open `http://127.0.0.1:4173`, and sign in with the password stored in `APP_PASSWORD` in `.env`.

The `.env` file is ignored by Git. Do not use a `NEXT_PUBLIC_` prefix for any secret. Never paste the database URL into browser code, issue comments, or documentation.

## Vercel project

The existing project is `iasminmins-projects/hunter-pro`, connected to `Iasminmins/hunter-pro` on `main`. Add the following server-only values in **Settings → Environment Variables** for **Production**:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Pooled Neon URL for the Hunter Pro production branch and `neondb` |
| `APP_PASSWORD_HASH` | Encoded hash produced by `npm run hash-password` |
| `SESSION_SECRET` | Random secret, at least 32 characters |

Keep values marked sensitive. Production credentials are not assigned to Preview deployments; a preview deployment should use a separate Neon branch before it is enabled for database access. Redeploy `main` after adding or changing variables; Vercel applies environment changes to new deployments.

## First login and browser data

After sign-in, the app compares each browser's local HSG and trader state with Neon. Review the record counts shown for each area. Choose **Importar dados do navegador** to make that browser copy the Neon state for that area, or choose **Usar dados do Neon** to replace the browser cache with the current server copy. When Neon has no state and local data exists, importing is explicit. The browser copy is retained until Neon acknowledges the import.

An import is performed one area at a time so a failed area can be retried safely. If a second area fails after the first succeeds, sign in again and choose the correct source for the remaining area. The HSG JSON backup remains available in **Versões** and excludes trader accounts.

## Sync recovery

- **Sem conexão:** edits remain in local storage. Restore connectivity; the latest unsynced area is retried when the browser reports online.
- **Conflito de versão:** another tab saved first. Export any local work to preserve it, then reload the Neon state before continuing. Do not repeatedly retry the stale write.
- **Sessão encerrada:** sign in again. Local recovery copies remain available.
- **Schema indisponível:** verify that migration `001_hunter_pro_init.sql` is applied to the selected branch and database.
- **Credenciais ausentes:** check Vercel Production environment variables and create a new deployment after correcting them.

The API enforces same-origin writes, a signed HTTP-only session cookie, a 12-hour session lifetime, request-size limits, and optimistic revisions. The Neon snapshot trigger prevents changes or deletion to frozen snapshots.

`app_state` guarda o payload canônico completo de cada área. As tabelas relacionais são projeções para consulta e preservam revisões mensais e snapshots como histórico. Um snapshot com o mesmo nome nunca é alterado, e dados OOS só são associados ao snapshot quando ele é criado pela primeira vez.
