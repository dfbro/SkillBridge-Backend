# ADR 0001 — PostgreSQL through Cloudflare Hyperdrive

- **Status:** Accepted for MVP foundation
- **Date:** 2026-11-25

## Context

The starter used Cloudflare D1/SQLite, while the SkillBridge TDD specifies Supabase PostgreSQL and recommends Cloudflare Hyperdrive for Worker connectivity. Local development must exercise the Worker runtime without requiring a hosted Supabase project.

## Decision

- Use Supabase PostgreSQL as the hosted source of truth.
- Use Drizzle ORM with the `node-postgres` adapter and `pg` driver.
- Use Cloudflare Hyperdrive as the Worker binding in deployed environments.
- Use Wrangler/workerd local mode with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` pointing to local PostgreSQL.
- Keep separate migration and runtime roles. Runtime role has DML privileges and must not own schema objects or bypass RLS.
- Keep the local `auth.users` fixture outside production migrations because Supabase owns that schema/table.

## Consequences

- Local development validates SQL behavior and Worker integration, but not Hyperdrive pooling/cache behavior.
- A real Supabase project, credentials, JWT signing configuration and Hyperdrive ID are required for staging validation/deployment.
- Local PostgreSQL trust authentication is scoped to the development database, named roles and loopback only; replace it with SCRAM before shared use.

## Alternatives considered

- Keep D1: rejected because it conflicts with the TDD's PostgreSQL/Supabase baseline.
- Connect directly to Supabase from Workers: rejected as the standard runtime path because Hyperdrive is the documented connection/pooling integration.
- Use a separate ORM/driver: rejected to keep Drizzle as specified and use Cloudflare's documented node-postgres path.
