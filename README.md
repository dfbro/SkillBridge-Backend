# SkillBridge Backend

Backend API for SkillBridge, built as a Hono modular monolith on Cloudflare Workers with feature-oriented Vertical Slice Architecture.

## Stack

- Cloudflare Workers + Wrangler / workerd
- Hono + `@hono/zod-openapi`
- Zod request/response validation
- Drizzle ORM + PostgreSQL (`pg` / node-postgres)
- Cloudflare Hyperdrive for Worker-to-PostgreSQL connectivity
- Supabase PostgreSQL and Supabase Auth (remote project configuration required)
- `jose` for JWT verification against Supabase JWKS

## Requirements

- Node.js 22+
- npm
- PostgreSQL 18 (local development)
- Wrangler 4 (installed as a project dependency)

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Initialize PostgreSQL and create a local database plus separate `skillbridge_migrator` and `skillbridge_app` roles. The migration role owns the schema; the runtime role receives DML privileges only.

3. Create a local-only Supabase Auth compatibility fixture. This fixture is for local development only; Supabase owns `auth.users` in hosted environments:

   ```sh
   psql "$DATABASE_URL" -f scripts/dev-bootstrap.sql
   ```

4. Configure the Hyperdrive local connection string. Wrangler needs this variable in its process environment when starting local development:

   ```sh
   export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE='postgresql://skillbridge_app@127.0.0.1:5432/skillbridge_dev'
   ```

   The checked-in configuration intentionally contains only a placeholder Hyperdrive ID. For this local host, the PostgreSQL `pg_hba.conf` contains a narrow trust rule limited to the `skillbridge_dev` database, `skillbridge_app` role and IPv4 loopback. This is not suitable for a shared host; replace it with SCRAM password authentication before exposing the service to other local users or networks.

5. Apply migrations and start the Worker:

   ```sh
   npm run db:migrate:local
   npm run dev
   ```

The API is served at `http://localhost:8787`.

## Environment configuration

Copy `.env.example` as a reference; never commit real credentials.

| Variable / binding | Purpose |
| --- | --- |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | Local PostgreSQL connection used by Wrangler to emulate Hyperdrive |
| `HYPERDRIVE.connectionString` | Runtime connection string supplied by Cloudflare Hyperdrive |
| `SUPABASE_JWKS_URL` | Supabase project's asymmetric JWT JWKS endpoint |
| `SUPABASE_ISSUER` | Expected JWT issuer, normally the project's `/auth/v1` issuer URL |
| `CORS_ORIGINS` | Comma-separated frontend origins allowed by the API; defaults to `*` when unset |
| `DATABASE_URL` | Migration role connection; defaults to local development DB as `skillbridge_migrator` |

Supabase Auth routes intentionally return `503 AUTH_NOT_CONFIGURED` until `SUPABASE_JWKS_URL` and `SUPABASE_ISSUER` are supplied. The auth middleware verifies issuer, `authenticated` audience, signature and expiry. The current implementation assumes an asymmetric signing key/JWKS configuration; legacy HS256 projects need a separately reviewed verification strategy.

## API routes

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Service health |
| GET | `/health/database` | Public | PostgreSQL connectivity check through Hyperdrive |
| GET | `/api/v1/me` | Bearer JWT | Read or initialize own profile |
| PATCH | `/api/v1/me` | Bearer JWT | Update own profile |
| GET | `/api/v1/me/career-goals` | Bearer JWT | List own career goals |
| PUT | `/api/v1/me/career-goals` | Bearer JWT | Replace own career goals (one primary, up to five) |
| DELETE | `/api/v1/me/career-goals/{goalId}` | Bearer JWT | Delete a non-primary goal; replace the collection to remove the primary goal |
| GET | `/api/v1/missions` | Public | List published missions |
| GET | `/api/v1/missions/{missionId}` | Public | Published mission and rubric detail |
| POST | `/api/v1/missions/{missionId}/submissions` | Bearer JWT | Submit text work for a published mission |
| GET | `/api/v1/me/submissions` | Bearer JWT | List own submissions |
| GET | `/openapi.json` | Public | Generated OpenAPI 3.0 document |

## OpenAPI contract for frontend

The route definitions are the source of truth. Each route is registered with `createRoute` / `app.openapi(...)` and its Zod request, response and error schemas. The runtime document is available at:

```text
GET http://localhost:8787/openapi.json
```

Export a static snapshot for frontend tooling/review:

```sh
npm run openapi:export
```

This writes `docs/openapi.json`. Regenerate it after changing any route or schema. The document includes HTTP methods, path/query/body parameters, response schemas, tags and the Bearer JWT security scheme.

## Database workflow

```sh
npm run db:generate       # Generate SQL from src/db/schema.ts
npm run db:migrate:local  # Apply generated migrations to local PostgreSQL
npm run db:migrate:remote # Apply to the DATABASE_URL supplied securely for a hosted DB
npm run db:studio         # Open Drizzle Studio
```

For a hosted Supabase database, set `DATABASE_URL` through a secure environment/secret manager and run the migration script deliberately after reviewing the generated SQL. Do not use the local auth fixture on Supabase; `auth.users` is managed by Supabase. Production runtime access must use a least-privilege database role and Hyperdrive. Local Hyperdrive mode connects directly to PostgreSQL and does not reproduce Cloudflare pooling/cache behavior.

## Development checks

```sh
npm run check
npm test
npm run openapi:export
```

## Architecture and task tracking

- `tasks/plan.md` — approved architecture, delivery phases, risks and open decisions.
- `tasks/todo.md` — vertical slices, acceptance criteria and verification checklist.
- `src/features/` — feature-owned routes, schemas, services/repositories and tests.
- `src/shared/` — cross-feature auth, database and HTTP infrastructure only.

This is an incremental MVP foundation. Assessment/reviewer workflows, Groq feedback, XP ledger, dashboard and recommendations remain future slices; they are not represented as implemented API routes yet.

## GitHub CLI

The repository remote is `origin` at `https://github.com/dfbro/SkillBridge-Backend`. GitHub CLI is installed; check authentication with `gh auth status` and use `gh auth login` if needed.
