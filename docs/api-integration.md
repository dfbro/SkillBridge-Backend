# Frontend integration contract

This document is for the frontend developer integrating with the SkillBridge Backend. The backend repository is the source of truth for API behavior. The frontend is a separate implementation and must not duplicate backend business rules or access PostgreSQL/Supabase product tables directly.

## Contract and schema export

- Live OpenAPI: `GET /openapi.json`
- Committed snapshot: `docs/openapi.json`
- Export from the backend repository: `npm run openapi:export`
- Contract version in the current document: OpenAPI 3.0.0, API info version 1.0.0.

After any route, validation schema, response or auth-contract change:

1. Run `npm run openapi:export`.
2. Review `docs/openapi.json` in the same backend PR.
3. Run `npm run check` and `npm test`.
4. Merge the backend PR before the frontend updates its pinned schema/client.
5. Frontend developer copies/downloads the merged `docs/openapi.json` and regenerates client types in their own repository.

The snapshot is generated from the registered Hono routes by `scripts/export-openapi.ts`; do not hand-edit it.

## Authentication

Protected endpoints require:

```http
Authorization: Bearer <Supabase access_token>
```

The frontend obtains the access token from Supabase Auth. It must not send an ID token, refresh token, user metadata role, or a client-selected user ID as an authorization substitute.

The backend verifies JWT signature using the configured Supabase JWKS URL, issuer and `authenticated` audience, then reads `app_metadata.role` from the verified payload. Only `student` is currently supported. Missing role defaults to student in the current implementation; an explicit unsupported/malformed role is rejected. Backend ownership checks derive the user ID from JWT `sub`, not from request bodies.

Expected auth failures:
- `503 AUTH_NOT_CONFIGURED`: backend JWKS/issuer environment is missing.
- `401 UNAUTHENTICATED`: no Bearer access token.
- `401 INVALID_TOKEN`: token invalid/expired or issuer/audience/signature check failed.
- `403 ROLE_NOT_ALLOWED`: account role not enabled.

The frontend should refresh/recheck the Supabase session at most once after a 401, then return to sign-in. A 403 is an account provisioning/support state, not a cue to retry with a different role.

## API response envelope

Success:

```json
{ "success": true, "data": {} }
```

Application error:

```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Readable message" } }
```

Health endpoints are operational exceptions and return their documented health payload directly. Error responses may include a requestId for unexpected server errors. Preserve the request ID in support diagnostics.

## Student account and profile

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/me` | Read or initialize the authenticated student's profile |
| PATCH | `/api/v1/me` | Update profile fields `displayName`, `avatarUrl`, `bio` |
| GET | `/api/v1/me/career-goals` | List career goals |
| PUT | `/api/v1/me/career-goals` | Replace the complete career-goal list |
| DELETE | `/api/v1/me/career-goals/{goalId}` | Delete a non-primary career goal |

Career-goal replacement accepts 1–5 goals and exactly one must have `isPrimary: true`. Deleting the primary goal directly returns 409; replace the list with PUT instead. The API uses the authenticated user identity and ignores any client-supplied ownership identity.

Supabase identity attributes (email, verified status, password) are not profile fields. Use Supabase Auth flows for password reset and identity changes if enabled by the product owner; do not send them to `PATCH /me`.

## Current route inventory

| Method | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | Public | Worker health |
| GET | `/health/database` | Public | Database connectivity; restrict exposure/monitoring as appropriate |
| GET | `/api/v1/missions` | Public | Published missions |
| GET | `/api/v1/missions/{missionId}` | Public | Mission and current rubric |
| POST | `/api/v1/missions/{missionId}/submissions` | Student | Text-only submission |
| GET | `/api/v1/me/submissions` | Student | Own submissions |
| GET/PUT | `/api/v1/me/learning-preferences` | Student | Daily XP goal and timezone |
| GET | `/api/v1/me/progress` | Student | XP, level, streak and daily progress |
| GET | `/api/v1/me/activity` | Student | Practice activity history |
| GET | `/api/v1/me/achievements` | Student | Achievement states |
| GET | `/api/v1/me/dashboard` | Student | Aggregated student dashboard |
| GET | `/api/v1/me/recommendations` | Student | Rule-based mission recommendations |
| GET | `/api/v1/submissions/{submissionId}` | Student | Own submission |
| POST/GET | `/api/v1/submissions/{submissionId}/assessment` | Student | Request/read assessment lifecycle only |

Assessment endpoints are request/status only. A queued run does not mean assessment has completed; the current API reports `processorConfigured: false`. No score, feedback or final result should be presented as available until a future backend slice implements processing and mandatory human review.

Progression values are provisional. While policy status is provisional, effective XP reward is zero and achievements are not unlocked. The frontend must render the policy state returned by the backend, not hardcode reward values or imply that an activity awards XP.

## Integration rules

1. Generate API types from the committed OpenAPI snapshot; do not recreate request/response types manually.
2. Keep Supabase Auth for identity/session only. All SkillBridge product data comes from this REST API.
3. Never trust frontend role, user ID or ownership fields.
4. Treat error codes and HTTP status as authoritative; do not silently retry 403.
5. Treat `processorConfigured: false` and provisional progression policy literally.
6. Use the API's timezone-aware progress/activity values rather than recomputing streaks in the browser.
7. Send requests from an origin explicitly allowed by backend `CORS_ORIGINS`.
