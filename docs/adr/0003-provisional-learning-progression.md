# ADR 0003 — Configurable learning progression with provisional rewards

- **Status:** Accepted for implementation; reward values await product approval
- **Date:** 2026-11-25

## Context

The PRD requires XP and levels as motivation, separately from rubric/competency scores. It explicitly leaves XP amounts, level thresholds, streak rules, bonuses, and the moment at which XP is granted undecided. The backend still needs a coherent progress API for the frontend.

## Decision

- Record every successful submission as a backend-owned, idempotent `submission.created` progression event in the same PostgreSQL transaction as the submission.
- Derive activity day from the learner's stored IANA timezone. Multiple submissions on one local calendar day contribute to the same daily activity; consecutive practice days update current/longest streaks.
- Make the current-streak grace window configurable (`streakGraceDays`, default 1 in the provisional policy); the value is included in the policy response.
- Expose daily goal and timezone preferences, progress, daily activity history, achievements, and the current policy through Zod/OpenAPI routes.
- Keep XP rewards, level thresholds, daily goal bounds, and achievement criteria in one validated `PROGRESSION_POLICY_JSON` configuration contract.
- Default policy status is `provisional`. In that state, actual XP reward is 0 and achievements are not unlocked, even though proposed defaults are returned for frontend review. Only an explicitly approved policy activates points/achievement awards.
- XP is never derived from, added to, or used to alter rubric/competency scores.

## Provisional defaults (not approved product rules)

- Daily XP goal: 20; allowed range: 10–100.
- Current-streak grace: one local calendar day.
- Suggested levels: 0, 100, 250, 500, 1000 XP.
- Suggested submission reward: 10 XP.
- Suggested achievements: first practice, 3-day streak, 7-day streak, 10 practices.

These values are surfaced by `GET /api/v1/progression/policy` as provisional and do not grant XP until status changes to `approved` after product sign-off.

## Consequences

- Frontend can build progression screens and preferences against a stable OpenAPI contract before reward policy is finalized.
- Local tests can verify timezone math, idempotency, activity aggregation, levels and achievement evaluation without Supabase.
- Events created while provisional remain zero-point events after policy approval; no retroactive reward backfill occurs automatically.
- Product sign-off is still required for real rewards and user-facing milestones; Supabase/Cloudflare production configuration is separately required for remote auth and persistence.

## Alternatives considered

- Hardcode an assumed reward policy: rejected because PRD explicitly marks amounts and timing as undecided.
- Accept XP values from client requests: rejected because clients must never award themselves points.
- Use logins as streak activity: rejected because the PRD frames gamification around practice rather than passive login counts.
