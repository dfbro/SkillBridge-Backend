# Backend setup and deployment guide

This guide covers only the SkillBridge Backend. It does not deploy the frontend. The frontend developer consumes the OpenAPI contract separately.

## 1. Prerequisites

- Node.js 22+, npm and Git.
- Cloudflare account with permission to create Workers and Hyperdrive.
- Supabase project with PostgreSQL and Auth configured for asymmetric JWT signing/JWKS.
- Secure access to the hosted PostgreSQL connection string and Cloudflare secrets.
- Approved backend environment names, domains and allowed frontend origins.

## 2. Local setup

Install dependencies:

```sh
npm ci
```

For local PostgreSQL, create database `skillbridge_dev`, migration role `skillbridge_migrator`, and runtime role `skillbridge_app`. Keep schema ownership and runtime access separate. The local-only `scripts/dev-bootstrap.sql` creates a minimal `auth.users` compatibility table and grants its read access; never run it on Supabase.

Fish shell environment:

```fish
set -x DATABASE_URL 'postgresql://skillbridge_migrator@127.0.0.1:5432/skillbridge_dev'
set -x CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE 'postgresql://skillbridge_app@127.0.0.1:5432/skillbridge_dev'
```

Apply migrations and start local Worker:

```fish
npm run db:migrate:local
npm run dev
```

Local endpoints:
- `http://localhost:8787/health`
- `http://localhost:8787/health/database`
- `http://localhost:8787/openapi.json`

For real protected-route testing, create/select a Supabase Auth project and configure ignored `.dev.vars` with `SUPABASE_JWKS_URL`, `SUPABASE_ISSUER` and a local `CORS_ORIGINS`. Do not commit `.dev.vars`, `.env` or credentials.

## 3. Supabase Auth and database prerequisites

The backend expects:
- JWKS: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
- Issuer: `https://<project-ref>.supabase.co/auth/v1`
- JWT audience: `authenticated`
- An asymmetric signing key that is published through JWKS.

The backend verifies the access token; it does not provide sign-up, password reset or account management endpoints. The frontend calls Supabase Auth directly for identity/session and sends the resulting access token to this API.

Student role is read from verified JWT `app_metadata.role`. Missing role currently defaults to `student`; explicit unsupported values are rejected. Decide student admission and trusted claim provisioning before enabling real users. Never place Supabase service-role credentials in frontend code.

Before production, validate database authorization carefully. The app uses a separate runtime database connection through Hyperdrive. Ensure the runtime role has only the exact table/sequence privileges required by current routes, and verify that per-user isolation is enforced by application queries and/or an approved PostgreSQL RLS user-context strategy. Do not assume a generic DML grant is sufficient or safe.

## 4. Cloudflare Hyperdrive configuration

Create a Hyperdrive configuration pointing to the intended hosted PostgreSQL endpoint. Use the runtime database role, not the migration owner. Keep the connection string in Cloudflare's secure configuration workflow.

The checked-in `wrangler.jsonc` now has two environments:

| Wrangler target | Worker name | Supabase project | Hyperdrive |
| --- | --- | --- | --- |
| `--env alpha` | `skillbridge-backend-alpha` | `gzrhbsbjxnspjxyppyjj` | `c9cfe32a1b9f4aaa8b02fcbd70378bc3` |
| default (Production) | `skillbridge-backend` | Placeholder | Placeholder (`00000000000000000000000000000000`) |

The Alpha JWKS endpoint was checked from the development server and returned HTTP 200 with an ES256 public key. This confirms the URL is live; it does not prove the Worker can connect to the Alpha database yet.

Replace the Alpha `CORS_ORIGINS` placeholder with the exact frontend Alpha origin before deployment. Production project ref, issuer/JWKS URL, Hyperdrive ID and frontend origin intentionally remain placeholders until the Production resources exist. Never deploy the default environment while those placeholders remain.

Verify that the Cloudflare Worker runtime supports the selected `pg`/Node compatibility configuration and Hyperdrive connection mode. Test connection and query behavior in a non-production environment first.

## 5. Worker variables and secrets

The following values are **plain-text Worker variables, not secrets**. They are already declared under the appropriate `vars` blocks in `wrangler.jsonc`, so Wrangler will keep them version-controlled with the deployment config:

- `ENVIRONMENT`
- `SUPABASE_JWKS_URL`
- `SUPABASE_ISSUER`
- `CORS_ORIGINS`

Bindings and `vars` are not inherited by Wrangler named environments. Each environment must define its own values and Hyperdrive binding. Do not duplicate the same configuration manually in the Dashboard unless deliberately migrating the source of truth away from Wrangler.

Actual secrets (for example a future Groq API key) belong in Cloudflare Worker Secrets, not `vars` or Git. Example for a future Alpha-only secret:

```sh
npx wrangler secret put GROQ_API_KEY --env alpha
```

Hyperdrive stores the database connection credentials in its own configuration; do not add the PostgreSQL password as a Worker `var` or commit it. Keep Cloudflare API tokens in GitHub Actions secrets when CI/CD is configured.

### Wrangler authentication from the remote server

For a remote/headless server, use the device authorization flow so the browser on your own computer does not need to reach a callback server on the remote machine:

```sh
npx wrangler login --device --browser=false
npx wrangler whoami
```

Wrangler prints a Cloudflare device URL and one-time code. Open the URL on your own device, enter/approve the code, and leave the remote command running until it reports successful login. Do not share the resulting local Wrangler credentials.

## 6. Database migrations

Review every pending SQL migration before applying it to hosted data. Supply the migration role URL securely to the migration command. Example:

```fish
set -x DATABASE_URL '<secure migration-role connection string>'
npm run db:migrate:remote
```

Do not use the runtime role for migrations. Never apply `scripts/dev-bootstrap.sql` to Supabase; Supabase manages `auth.users`.

The current schema references `auth.users` and expects profile IDs to match Supabase Auth user UUIDs. Validate hosted schema permissions and the intended profile bootstrap path before enabling traffic.

## 7. Pre-deploy checks

```sh
npm run check
npm test
npm run openapi:export
git diff --check
```

The current baseline at documentation time: TypeScript check passes; 33 tests pass; 9 PostgreSQL-backed integration tests are skipped when the local test database is unavailable. Run the integration suite against a disposable database before release.

Export OpenAPI and review `docs/openapi.json` as part of any API change. The frontend developer should pull the merged snapshot and regenerate their own typed client.

## 8. Deploy and verify

After the Hyperdrive ID, required Worker vars, explicit CORS allowlist, DB privileges, JWT settings and migrations have been reviewed, deploy Alpha first:

```sh
npm run deploy:alpha
```

Only after Alpha verification and after all Production placeholders have been replaced, deploy the default Production Worker:

```sh
npm run deploy:production
```

The Production scripts explicitly pass `--env ""` because Wrangler warns when a configuration has named environments but a deployment command does not specify its target. This selects the top-level Worker (`skillbridge-backend`) intentionally.

Verify:
1. `GET /health` returns service status.
2. `GET /health/database` returns database reachable.
3. `GET /openapi.json` serves the current contract.
4. Protected `GET /api/v1/me` with a valid student access token succeeds.
5. Missing/invalid token returns 401; unsupported role returns 403.
6. Profile and career-goal operations are scoped to the authenticated user.
7. Requests from an unapproved origin do not receive permissive CORS headers.
8. Assessment endpoints remain request/status only; no final assessment is implied.

## 9. Production readiness blockers

Do not treat this repository as production-ready solely because it builds. Before a public production release, explicitly review and test:
- runtime DB grants and RLS/user-context isolation;
- wildcard CORS fallback (must be overridden with exact origins);
- real Hyperdrive ID and secret management;
- asymmetric Supabase signing/JWKS and trusted student admission/role provisioning;
- migration rollback/backup and recovery procedure;
- rate limiting/abuse controls, observability and alerting;
- privacy, retention and deletion obligations;
- assessment processor and mandatory human-review lifecycle if assessment finalization is introduced.

This guide is the backend deployment procedure; frontend build/deployment is owned by the frontend developer.
