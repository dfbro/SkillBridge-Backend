# ADR 0004 — Source-backed student dashboard and explainable mission suggestions

- **Status:** Accepted for MVP slice
- **Date:** 2026-11-25

## Context

PRD features SB-F09 and SB-F11 require a student dashboard based on actual practice history and optional suggestions from published missions. The TDD recommends simple, transparent rules before a dedicated recommendation model. Assessment scoring/finalization policy is still not approved.

## Decision

- Build `GET /api/v1/me/dashboard` from the authenticated user's submissions, their mission records, assessment run status flags and learning progression tables.
- Dashboard shows mission/submission counts, recent submissions and assessment status/final-provisional metadata. It does not fabricate assessment scores or feedback; those remain in the assessment slice after the relevant policy is agreed.
- Keep XP/level/streak in a separate `progression` section and do not imply competency improvement from XP.
- Build `GET /api/v1/me/recommendations` from published missions only. Compare saved career-goal keywords with mission title/summary, rank matches first, and use recent published unattempted catalogue entries as an exploration fallback.
- Return the basis, matched terms, career goal label and a readable reason. Recommendations are optional practice suggestions and never job-readiness or career-fit predictions.
- Exclude missions already attempted by the learner from the next-practice recommendation list.

## Consequences

- Dashboard/recommendation data is derived from source records and does not require a separate materialized dashboard table.
- Suggestions are explainable and deterministic; they are a starter rule, not a measure of career compatibility.
- Assessment score/feedback presentation remains limited until an approved assessment lifecycle and authorization contract exists.

## Alternatives considered

- AI-generated career/job predictions: rejected for MVP because the PRD explicitly limits recommendation claims and does not define the required evidence/policy.
- Recommend unpublished or already-attempted missions: rejected because suggestions must point to currently available practice.
- Store dashboard counters independently: rejected because duplicated state risks drift from submission/assessment/XP source records.
