# SkillBridge full setup guide

This document records the broader system architecture and unresolved setup decisions. The active development scope is backend-only; frontend implementation and deployment belong to the separate frontend developer. For actionable backend setup and Cloudflare deployment, use [deployment-guide.md](deployment-guide.md). For frontend API consumption, use [api-integration.md](api-integration.md). Values marked `<...>` must come from the project owner/provider dashboard; never commit real values.

## 0. What runs where

| Component | Responsibility | Source of truth |
| --- | --- | --- |
| React + Vite frontend (planned separate repo) | Student UI, auth screens, account/profile UI | Browser; no product database access |
| Supabase Auth | Student identity, password/session, email verification | Supabase Auth |
| SkillBridge Backend Worker | API, verified JWT, student role and ownership checks, business rules | Hono + Zod/OpenAPI |
| Supabase PostgreSQL | Profiles, missions, submissions, progress and other product data | PostgreSQL via backend only |
| Cloudflare Hyperdrive | Worker-to-PostgreSQL connectivity | Cloudflare binding |

The browser must never use the Supabase Data API or a PostgreSQL connection for SkillBridge product data. The browser obtains a Supabase access token and sends it to the backend as a Bearer token. The backend verifies the signature, issuer, audience and expiry before authorizing the student.

## 1. Prerequisites

- Node.js 22+, npm, Git and GitHub CLI (`gh`).
- PostgreSQL 18 for local development.
- A Supabase project for real authentication and hosted PostgreSQL integration.
- A Cloudflare account for Worker/Hyperdrive deployment.
- Access to the `dfbro/SkillBridge-Backend` repository. The frontend repository and UI implementation are owned by the separate frontend developer.

## 2. Local backend and PostgreSQL

From the backend repository:

```sh
npm install
```

Create a local database named `skillbridge_dev` and two separate roles:

- `skillbridge_migrator`: owns/applies schema migrations.
- `skillbridge_app`: least-privilege runtime role; it must not be a superuser or own the schema.

Use the repository's existing local PostgreSQL role/`pg_hba.conf` setup if this machine has already been provisioned. Do not copy a local `trust` authentication rule to a shared or production server; use SCRAM credentials outside isolated development. Keep the migration and runtime credentials separate.

Create the local-only compatibility table for `auth.users` after the database and roles exist:

```sh
psql "postgresql://skillbridge_migrator@127.0.0.1:5432/skillbridge_dev" -f scripts/dev-bootstrap.sql
```

This fixture exists only because a plain local PostgreSQL server does not contain Supabase's `auth.users`. **Never apply `scripts/dev-bootstrap.sql` to Supabase.** Supabase owns that schema/table in hosted environments.

For Fish shell, set the migration URL in the current shell before running migrations (replace credentials only if your local PostgreSQL setup requires them):

```fish
set -x DATABASE_URL 'postgresql://skillbridge_migrator@127.0.0.1:5432/skillbridge_dev'
npm run db:migrate:local
```

Configure Wrangler's local Hyperdrive emulation to use the runtime role, not the migration role:

```fish
set -x CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE 'postgresql://skillbridge_app@127.0.0.1:5432/skillbridge_dev'
```

The checked-in `wrangler.jsonc` contains a placeholder Hyperdrive ID for local development. Local mode connects directly to PostgreSQL and does not reproduce Hyperdrive pooling/caching.

## 3. Supabase Auth project setup

Create or select the intended Supabase project, then record its project URL and public/publishable key. Configure the Auth site URL and allowed redirect URLs for the local frontend origin and each approved deployed frontend origin. Enable only the sign-in providers and email-confirmation behavior that the product owner approves.

The frontend developer will need these build-time values:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
VITE_API_BASE_URL=http://localhost:8787
```

Only the Supabase publishable/anon key belongs in a browser build. Never put a Supabase `service_role` key, database password, Cloudflare API token or other secret in a `VITE_` variable.

The backend Worker needs the project's asymmetric JWT verification configuration. The expected values have this form:

```dotenv
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_ISSUER=https://<project-ref>.supabase.co/auth/v1
```

Put local values in the ignored `.dev.vars` file (do not commit it). For production/staging, configure these as Worker secrets or protected environment variables. The current middleware verifies the JWT using the project's JWKS, issuer and `authenticated` audience. It assumes asymmetric signing/JWKS; if the project uses legacy HS256 signing, stop and agree on a reviewed verification approach rather than weakening verification.

### Student role provisioning

The MVP supports `student` only. The backend reads `app_metadata.role` from the verified JWT; the role is not accepted from a browser form or `user_metadata`. If `app_metadata.role` is absent, the current backend defaults to `student`; an explicit unsupported value is rejected. A trusted server-side/admin provisioning process must control `app_metadata` if a role is explicitly assigned. Do not expose a service-role credential to the browser.

**Still TBD:** unrestricted self-registration versus invitation/school provisioning, allowed email domains, email verification requirements, and the final trusted workflow for setting student claims. Do not enable public registration in the product until that decision is made.

## 4. Run the backend Worker locally

Create/update ignored `.dev.vars` with the Supabase values above. Example shape only:

```dotenv
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_ISSUER=https://<project-ref>.supabase.co/auth/v1
```

Then run:

```sh
npm run dev
```

Expected local endpoints:

- `http://localhost:8787/health`
- `http://localhost:8787/health/database`
- `http://localhost:8787/openapi.json`

Check protected endpoints with a real Supabase access token. Without valid Supabase configuration, protected API routes intentionally fail closed (`503 AUTH_NOT_CONFIGURED`); with no/invalid token they return `401`.

Before frontend integration, export and review the API contract:

```sh
npm run openapi:export
npm run check
npm test
```

The OpenAPI snapshot is `docs/openapi.json`. The product response envelope is `{ success: true, data }` or `{ success: false, error: { code, message } }`; `/health` and `/health/database` are operational exceptions.

## 5. Frontend integration boundary (frontend developer owned)

The selected architecture is documented in [ADR 0007](adr/0007-student-frontend-openapi-first-architecture.md). The frontend developer owns scaffolding, auth/session UX, account UI, client generation and frontend deployment. The backend contract is `docs/openapi.json`; regenerate it with `npm run openapi:export` after route/schema changes. The integration requirements and current route list are in [api-integration.md](api-integration.md).

### Student account screens and flows

- **Sign in:** Supabase Auth sign-in; on success restore session and load `/api/v1/me`.
- **Forgot/reset password:** request a reset email and handle the configured redirect/deep link; password reset is completed through Supabase Auth.
- **Sign out:** call Supabase Auth sign-out, clear user-scoped query cache and navigate to sign-in.
- **Account/profile:** read/update student profile via `GET/PATCH /api/v1/me`; manage career goals through the existing career-goal endpoints.
- **Security settings:** password/email change only through Supabase Auth and only if enabled in the project. Respect email verification/confirmation.
- **Registration:** do not expose a public sign-up flow until admission policy is decided.
- **Delete account:** not in the first MVP until data retention, legal/privacy and cascade behavior are specified and approved.

## 6. Cloudflare staging/production wiring

After the Cloudflare account, project ownership, domains and environment plan are approved:

1. Create a Hyperdrive configuration pointing to the intended Supabase PostgreSQL connection. Store the connection string through Cloudflare's secure configuration flow; do not place it in Git or frontend variables.
2. Replace the placeholder `hyperdrive.id` in the appropriate Wrangler environment configuration with the real Hyperdrive ID. Keep separate development/staging/production bindings where appropriate.
3. Configure backend Worker vars `SUPABASE_JWKS_URL` and `SUPABASE_ISSUER`.
4. Apply reviewed Drizzle migrations to the hosted database using the migration role and a securely supplied `DATABASE_URL`. Never run the local auth fixture against Supabase.
5. Deploy the backend Worker and verify `/health`, `/health/database`, `/openapi.json`, and a protected route with a valid student token.
6. Deploy the frontend as a separate Cloudflare Worker with Static Assets. Configure its `VITE_` build values for the matching backend API origin and Supabase project.
7. Verify sign-in, session refresh, sign-out, profile read/update and owner-scoped submission access from the deployed Android client.

Do not deploy to production until runtime DB permissions, user-context/RLS strategy, secrets, student admission, privacy/retention, and assessment-review operations are approved and tested.

## 7. Final verification checklist

- [ ] Local PostgreSQL has separate migrator/runtime roles and local-only auth fixture.
- [ ] Migrations apply cleanly; runtime Worker uses the least-privilege role.
- [ ] Supabase Auth issuer/JWKS match the actual project's asymmetric signing configuration.
- [ ] Student JWT role is server-controlled; browser cannot choose a role.
- [ ] Frontend uses Supabase Auth only and backend REST for all product data.
- [ ] Sign-in, reset-password, session restoration/refresh and sign-out work.
- [ ] Account profile and career-goal changes persist through the backend.
- [ ] Registration remains disabled until admission policy is approved.
- [ ] No service-role key, DB password or Cloudflare secret appears in frontend assets or Git.
- [ ] OpenAPI snapshot and generated frontend types match the backend contract.
- [ ] Assessment cannot be shown as final before mandatory human review.

## 8. Decisions still required

- Frontend repository creation/ownership, Cloudflare account/environment/domain ownership.
- Supabase project selection, sign-in provider, student admission/registration, email verification and role-claim provisioning.
- Whether email change/password change are enabled and account deletion/export/retention policy.
- Trusted reviewer access, rubric, assessment processor and finalization workflow.
- Production runtime DB role, RLS context strategy, Hyperdrive connection and secret management.
- Under-18 privacy/consent requirements and product data retention/deletion.
