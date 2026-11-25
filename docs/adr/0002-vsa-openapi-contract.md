# ADR 0002 — Feature-oriented VSA and generated OpenAPI contract

- **Status:** Accepted for MVP foundation
- **Date:** 2026-11-25

## Context

The backend and frontend are developed as separate components. The frontend needs a stable description of every implemented HTTP method, path, auth requirement, request body/query/path parameter, response and error schema. The project also needs feature-level ownership without introducing microservice deployment overhead.

## Decision

- Keep one Hono modular monolith deployed as one Cloudflare Worker.
- Organize business capabilities as vertical slices under `src/features/`; keep only cross-cutting infrastructure under `src/shared/`.
- Define route contracts with Zod and `@hono/zod-openapi` at the route boundary.
- Generate the runtime document at `/openapi.json` and static frontend artifact at `docs/openapi.json` from the same route definitions.
- Do not add generic CRUD methods without a product use case; every implemented GET/POST/PUT/PATCH/DELETE method must be represented by the generated document.

## Consequences

- Frontend can generate clients/types or build against the exported OpenAPI contract without duplicating hand-maintained schema definitions.
- Contract changes become visible in generated JSON and can be reviewed in pull requests.
- Success/error envelope conventions still require explicit agreement with the Frontend Lead before being treated as a cross-team contract.

## Alternatives considered

- Manually maintained API documentation: rejected because it can drift from route behavior.
- Separate OpenAPI file maintained independently from Zod schemas: rejected because it duplicates contract ownership.
- Microservices per feature: rejected for MVP due operational overhead and lack of independent scaling/deployment requirements.
