# ADR 0006 — Student-only roles, text-only submissions and mandatory assessment review

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

The existing backend plan treated the product role set, submission format and human-review policy as open decisions. The current implementation already uses verified Supabase JWT claims for identity, accepts text content for submissions, and exposes assessment request/status endpoints only. Product approval is now explicit for the MVP boundaries below.

## Decision

### 1. Product roles

- The only supported product role in the MVP is `student`.
- The backend reads role only from the verified JWT `app_metadata.role` claim. Request bodies and `user_metadata` are not authorization sources.
- If the claim is absent, the current compatibility behavior defaults the authenticated account to `student`. If the claim is explicitly present but is not `student`, the request is rejected with `403 ROLE_NOT_ALLOWED`.
- Do not introduce reviewer or admin as product roles, role tables, or reviewer-facing routes under this decision.
- Student admission/registration rules and provisioning of `app_metadata.role` remain TBD.

### 2. Submission format

- MVP submissions are text-only and use the existing `content` field.
- File, image and video uploads, attachment handling, asset tables and Supabase Storage are out of MVP scope.
- Expanding to attachments requires a separate decision covering limits, validation, storage, retention and privacy.

### 3. Assessment review

- Human review is mandatory before any assessment may be finalized.
- Automated assessment output, when later implemented, must remain draft/provisional and must not set `isFinal=true`.
- Finalization requires an explicit decision by a trusted human reviewer.
- A reviewer is not a product role in the current MVP. A separate trusted reviewer identity/access mechanism must be designed before reviewer operations or assessment finalization are implemented.
- Until a processor, rubric and trusted review path exist, assessment endpoints remain request/status only and queued runs do not imply that assessment processing has started.

## Consequences

- All currently implemented authenticated user routes are student-facing and enforce the student-only role allowlist.
- The existing text submission schema remains the MVP contract; no database migration or upload integration is required.
- Frontend can build student flows from the existing OpenAPI contract without designing reviewer/admin product interfaces.
- Generated OpenAPI remains the canonical frontend integration contract; frontend-specific framework and code-generation choices are deferred until its repository is available.
- Mandatory human review is a hard gate for final results. The assessment pipeline cannot be considered complete while reviewer identity, authorization, assignment and audit are unresolved.

## Open decisions (TBD)

- Student registration/admission policy and role-claim provisioning in Supabase.
- Trusted reviewer identity, authentication channel, authorization, assignment, audit trail and review SLA/queue.
- Rubric criteria, score scale, weights and version policy.
- Whether draft/provisional scores or feedback are visible to students before review.
- Assessment processor mode (synchronous or background queue), retries, timeouts and idempotency.
- Groq model, structured-output schema, prompt/data boundaries and provider failure handling.
- Retention/deletion, consent and privacy requirements for student data, including under-18 participants.
