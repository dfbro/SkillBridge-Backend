# ADR 0007 — Student frontend and OpenAPI-first integration

- **Status:** Accepted for MVP architecture
- **Date:** 2026-11-25

## Context

The backend already exposes a versioned REST API, Supabase JWT authentication, and a generated OpenAPI 3.0 document. The MVP has one product role (`student`), text-only submissions, and no reviewer/admin UI. There is no frontend repository in the current workspace. The frontend should follow the backend contract rather than introduce a second source of truth or connect directly to product tables.

## Decision

### 1. Application and hosting

- Build a browser-based **React + TypeScript single-page application using Vite**.
- Deploy it as a separate **Cloudflare Worker with Static Assets**, using the official Cloudflare Vite plugin. Keep the existing backend Worker as the independent REST API deployment.
- Use `VITE_API_BASE_URL` for the backend origin and configure the backend `CORS_ORIGINS` with exact frontend origins per environment. Do not use legacy Workers Sites.
- Prefer a separate frontend repository (working name: `SkillBridge-Frontend`) so UI releases do not require backend deployments. The remote repository has not been created or verified yet.
- Do not add SSR or a server-side data layer for the MVP: the application is an authenticated student workspace whose product data and authorization already live behind the backend API.

### 2. Routing and server state

- Use **React Router** for client-side application routes.
- Use **TanStack Query** for API server state, caching, mutation lifecycle and invalidation.
- Use React component/local state for transient UI state. Do not add Redux or another global state store until a concrete cross-feature requirement justifies it.
- Organize UI by backend-facing feature areas: auth, dashboard, missions, submissions, progression, and profile/career goals.

### 3. Authentication and trust boundaries

- Use `@supabase/supabase-js` for Supabase Auth session lifecycle only.
- Provide student-facing **sign-in, sign-out, session restoration/refresh, and password-reset** flows. Registration UI is conditional on the still-open student admission policy; do not enable unrestricted public sign-up by assumption.
- Add an **Account** area with the authenticated student's profile read/update, career-goal management, and account security/session actions. Use `GET/PATCH /api/v1/me` and the existing career-goal endpoints for application profile data; do not confuse Supabase Auth identity fields (email, verified status) with the backend-owned student profile.
- Password changes and email-change requests, if enabled in the selected Supabase Auth configuration, must use Supabase Auth client APIs—not backend profile PATCH. Email changes must respect Supabase's confirmation flow.
- Account deletion is not part of the first MVP screen set until retention, legal/privacy and deletion-cascade policy are approved. Never imply that signing out deletes an account.
- Attach the current Supabase access token as `Authorization: Bearer <token>` on backend API calls; allow the Supabase client to manage refresh.
- All product data reads/writes go through the SkillBridge backend. The browser must not use Supabase Data API or connect to PostgreSQL for product tables.
- A client-side route guard is a user-experience convenience only. Backend JWT verification, `student` role enforcement and owner checks remain the security boundary.
- Only student-facing routes exist in the MVP. Do not create reviewer/admin screens or infer reviewer permissions from a student account.

### 4. Generated API client and response contract

- The backend Zod route definitions remain the source of truth; `SkillBridge-Backend/docs/openapi.json` is the versioned OpenAPI snapshot generated from those routes.
- The frontend keeps a reviewed copy of the OpenAPI snapshot and generates TypeScript path types with `openapi-typescript`. Use `openapi-fetch` as the typed `fetch` client; refresh the snapshot and generated types in the same frontend PR whenever the backend API contract changes.
- Use the existing product API response envelope as the frontend contract: success responses use `{ success: true, data }`; API errors use `{ success: false, error: { code, message } }`. HTTP status remains authoritative. `requestId` is optional diagnostic metadata and must not be required for normal handling.
- `/health` and `/health/database` are operational health endpoints, not product API endpoints, and are intentionally outside the product response envelope.
- Do not hand-maintain duplicate request/response interfaces or introduce an adapter envelope that diverges from OpenAPI.

### 5. Quality baseline

- TypeScript strict checking and generated-client type checking are required in CI.
- Use Vitest and React Testing Library for component/hook tests; add Playwright for critical end-to-end student journeys once the frontend app is scaffolded.
- Validate user input for usability, but treat backend Zod validation as authoritative. Never trust client-submitted `user_id`, role, assessment score/finality or XP values.

## MVP screen scope

1. Sign-in, sign-out, restored session and password-reset screens.
2. Student dashboard and mission recommendations.
3. Published mission catalogue and mission detail.
4. Text-only mission submission and the student's own submission history/detail.
5. Assessment request/status display. `queued` means a request was recorded; it does not mean AI processing has started. Do not display invented scores or final feedback.
6. Learning preferences, progress, activity and achievements, with provisional reward policy clearly represented as provisional.
7. Account/profile area: view/edit student profile, career goals, and security actions supported by the configured Supabase Auth policies.

## Consequences

- Frontend work can begin from the existing OpenAPI snapshot without waiting for assessment scoring or reviewer workflow.
- A separate static-asset Worker keeps UI delivery independent while reusing the Cloudflare platform already used by the backend.
- A generated typed client keeps the contract aligned without coupling the frontend build to backend source-code internals.
- Backend contract changes require a coordinated snapshot/type refresh in the frontend.

## Open decisions (TBD)

- Creation/ownership of the frontend GitHub repository, initial deployment environments, public domains and exact API origins.
- Supabase project URL/publishable key per environment; sign-in methods, student admission/registration and provisioning of the server-controlled `app_metadata.role` claim.
- Whether students self-register, use invite-only/onboarding codes, or are provisioned by school staff; email verification and allowed email domains.
- Whether email change and password change are enabled; account deletion/export policy and data-retention/deletion cascade.
- Final UI design system, component library, accessibility targets beyond baseline WCAG practices, and visual/product acceptance.
- Trusted reviewer identity/access, reviewer assignment, audit trail and review SLA/queue. Mandatory human review remains a hard gate before any assessment finalization.
- Rubric criteria, score scale, weights/versioning, and whether provisional results are visible to students.
- Assessment processor mode, queue/retry/timeout/idempotency/monitoring policy, Groq model and structured-output/data-boundary policy.
- Approval of XP rewards, daily goal bounds, level thresholds, streak grace/bonus and achievement unlock rules.
- Student-data retention/deletion, consent and under-18 privacy requirements.
- Production Supabase signing configuration, runtime DB role, RLS user-context design, Hyperdrive credentials and deployment secrets.

## References

- [Cloudflare Workers — React + Vite](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare Workers — Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Supabase — Use Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [openapi-typescript / openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [TanStack Query — React](https://tanstack.com/query/latest/docs/framework/react/overview)
