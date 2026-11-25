# ADR 0005 — Owner-scoped assessment request and status-only API

- **Status:** Accepted as a non-scoring MVP slice; execution/finalization is deferred
- **Date:** 2026-11-25

## Context

The TDD proposes owner-scoped submission detail and assessment create/status endpoints, but leaves synchronous vs asynchronous execution open. The Groq model, rubric scoring scale, reviewer role, human-review policy and finalization rules are also not approved. The frontend still needs to request an assessment and display its lifecycle state without assuming scoring has happened.

## Decision

- Expose owner-only `GET /api/v1/submissions/{submissionId}`, `POST /api/v1/submissions/{submissionId}/assessment`, and `GET /api/v1/submissions/{submissionId}/assessment`.
- On POST, lock the owned submission row, then create one `queued` assessment run and transition the submission to `assessment_pending`.
- Reuse an existing non-failed run on repeat requests; allow a new run after a failed attempt; reject requests for finalized submissions/runs.
- Return `processorConfigured: false` and state clearly that the current API records a request only. There is no AI/background processor in this slice.
- Return lifecycle metadata only. Do not invoke Groq, write scores/criterion feedback, expose reviewer endpoints, or set `is_final=true`.
- A valid Supabase identity from auth context is the only ownership source; lookups return 404 for submissions not owned by the caller.

## Consequences

- Frontend can build the request/status UI and handle queued/reused/failed/finalized states against OpenAPI.
- The queued run remains queued until a separate worker/processor is implemented and configured.
- Scoring, provisional feedback presentation, review roles, reviewer assignments and finalization remain separate decisions and PRs.

## Alternatives considered

- Invoke an unspecified AI model immediately: rejected because provider/model and rubric policy are not approved.
- Mark the run `finalized` or return a default score: rejected because it would misrepresent an unexecuted assessment.
- Add reviewer endpoints now: rejected because reviewer role and assignment policy remain open.
