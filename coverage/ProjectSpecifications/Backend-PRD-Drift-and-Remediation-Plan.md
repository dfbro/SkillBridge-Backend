# SkillBridge Backend — PRD Drift Audit & Remediation Plan

**Audit date:** 28 November 2026
**Repository:** `dfbro/SkillBridge-Backend`
**Environment inspected:** Alpha Worker `skillbridge-backend-alpha`
**Status:** Audit baseline; remediation is to be executed in ordered PRs

## 1. Source of truth and interpretation

This audit compares the backend implementation against:

1. `Documents/Product Requirement Document ...md` — PRD v1.0, dated 23 November 2026, explicitly marked **Draft**.
2. `Documents/TECHNICAL DESIGN DOCUMENT (TDD) ...md` — technical proposal and open decisions.
3. `Documents/Technical Development Plan ...md` — implementation plan and team responsibilities.
4. Decisions explicitly given by the product owner in this project:
   - supported product role: `student`;
   - assessment review is mandatory;
   - submission format is text-only.
5. Later implementation direction: the current client is a native Android/mobile application. This supersedes the browser-client assumption for current deployment/CORS configuration, but the PRD/TDD still describe a web MVP and should be reconciled.

The PRD's Must/Should priority is preserved. A TDD recommendation or open decision is not treated as a finalized product requirement. Missing frontend UX is not classified as a backend defect unless it requires a backend contract or capability.

The three ZIP export blocks in `Documents/` were checked against their corresponding Markdown files; all three are byte-for-byte equivalent. The Markdown files are therefore sufficient for this audit.

## 2. Current verified baseline

### Runtime and deployment

- Alpha Worker is deployed at `https://skillbridge-backend-alpha.epg4tv.workers.dev`.
- Hyperdrive `c9cfe32a1b9f4aaa8b02fcbd70378bc3` resolves to `skillbridge-alpha-db`, Supabase shared pooler host `aws-0-ap-southeast-2.pooler.supabase.com`, runtime port `6543`, database `postgres`, user `postgres.gzrhbsbjxnspjxyppyjj`.
- Supabase migrations `0000` through `0003` were applied successfully through the IPv4 Session Pooler on port `5432`.
- `/health` and `/health/database` return success. `/openapi.json` is available. `/api/v1/missions` returns HTTP 200 but currently returns an empty list: there are **zero published missions** in Alpha.
- CORS middleware and `CORS_ORIGINS` were removed in PR #11 because the active client is native Android. Native HTTP clients do not enforce browser CORS. If a browser client is added later, CORS must be reintroduced with an explicit allowlist.

### Repository and tests

- Current `main` includes PR #9 (Alpha/Production Wrangler configuration), PR #10 (nested student-route authentication fix), and PR #11 (remove browser CORS for native Android).
- Latest known `main` commit at audit time: `50482a2`.
- `npm run check` passes.
- `npm test`: 42 passed, 9 PostgreSQL-backed tests skipped because the repository test suite is not configured to run against the live Alpha database.
- A live unauthenticated route sweep checked 17 protected operations. After PR #10, all 17 returned `401 UNAUTHENTICATED` as expected.
- No `.github/workflows` CI/CD workflow is present. No lint script is defined in `package.json`.

### Database security observation — critical

The Alpha database currently reports:

- connected role `postgres`;
- `rolsuper = false`;
- `rolbypassrls = true`;
- all 13 application tables have `relrowsecurity = false`;
- zero policies exist in `pg_policies` for schema `public`.

Backend queries currently include explicit user ownership filters in the inspected profile, career-goal, submission, assessment, progression, dashboard, and recommendation paths. That is useful application-layer protection, but the current database role bypasses RLS and the database has no RLS policies. This does not satisfy the TDD's least-privilege/RLS defense-in-depth direction and is not acceptable as the final pilot security posture.

## 3. PRD feature traceability

| PRD item | Priority | Current backend evidence | Status | Drift / next action |
|---|---|---|---|---|
| SB-F01 Career-goal onboarding | Must | `GET/PUT /api/v1/me/career-goals`; profile auto-initialization | Partial | The API requires 1–5 goals and exactly one primary goal. PRD explicitly allows a student to continue while unsure and explore. No explicit undecided/exploration state or onboarding completion state exists. Decide representation before changing schema. |
| SB-F02 Mission catalog | Must | `GET /api/v1/missions`, published-only query | Partial | Endpoint works after migrations but Alpha has zero published missions. No curated pilot content/seed data is present. TDD's suggested category field is also absent from `missions`. |
| SB-F03 Mission detail and rubric | Must | `GET /api/v1/missions/{missionId}` returns instructions and published rubric criteria | Partial | No published records exist in Alpha. Current mission model has `summary` and `instructions`, but no explicit category, scenario, or expected-output-type fields. Text-only submission is an approved simplification, but each mission still needs a clear expected text output and rubric. |
| SB-F04 Mission practice | Must | Mission detail plus text submission endpoint | Partial | Backend accepts text only, matching the explicit product-owner decision. No draft/resume workflow is implemented; PRD does not settle whether drafts are required. |
| SB-F05 Submission | Must | `POST /api/v1/missions/{missionId}/submissions`, 1–20,000 character text; ownership derived from JWT; transaction stores submission and practice event | Partial | Text-only matches the decision. No live authenticated Alpha E2E has been run. No file assets are present, which is acceptable under the text-only decision. |
| SB-F06 Rubric assessment | Must | Assessment request/status endpoints and `assessment_runs` table | Missing | The endpoint only creates/reuses a queued run. It does not score rubric criteria, create criterion results, or execute an assessment processor. `processorConfigured` is always `false`. |
| SB-F07 Feedback | Must | Assessment status only; `assessment_criterion_results` table exists | Missing | No feedback generation or result retrieval is implemented. Criterion result table has `score` and `feedback` but no evidence field. There is no reviewer decision/finalization workflow. |
| SB-F08 XP and level | Must | Progression policy, XP ledger, daily activity, progress and achievements endpoints | Partial / intentionally provisional | Default policy status is `provisional`; `effectiveXpReward()` returns zero until policy is approved. This safely avoids inventing rewards, but active XP/level gamification is not yet delivered. Product owner must approve XP events, amounts, thresholds and streak rules before activation. |
| SB-F09 Student dashboard | Must | `GET /api/v1/me/dashboard` aggregates mission counts, submissions, assessment lifecycle, XP/progress | Partial | Summary and progress exist, but no rubric scores or feedback can appear until assessment is implemented. Alpha currently has no missions, so the live dashboard would have no meaningful catalog context. |
| SB-F10 AI feedback | Should / tested | No Groq SDK, provider adapter, AI service, API key binding, or AI evaluation harness found | Missing | This is a Should feature in the PRD, not a Must blocker by itself. TDD describes Groq, structured output validation, prompt-injection handling and provider failure states; implementation remains outstanding. |
| SB-F11 Next-mission recommendations | Should / tested | `GET /api/v1/me/recommendations`; keyword overlap with career goals plus catalog fallback | Partial | This is a transparent rule-based baseline and fits TDD's MVP recommendation. It does not use rubric gaps or competency evidence, and returns no useful recommendations while the catalog is empty. |

## 4. Cross-cutting drift and conflicts

### 4.1 Mandatory human review conflicts with the selected role set

The product owner selected only `student` as a supported product role and separately made assessment review mandatory. The current auth resolver accepts only `student`; `reviewer`, `admin`, and other roles are rejected. The TDD describes reviewer permissions as a possible role and lists reviewer endpoints as proposed, but leaves them open. No reviewer queue, review table, review endpoint, or reviewer audit trail exists.

**This is a blocking product/authorization decision.** Mandatory review cannot be completed safely without defining who the trusted reviewer is and how that identity is authorized. Do not silently add `reviewer` to public self-registration or weaken the student-only rule. Possible approaches to decide: an internal-only `reviewer` claim not assignable by clients, or an external/manual reviewer process with a trusted server-side action.

### 4.2 Authentication and registration boundary

Supabase Auth is the identity provider. The backend verifies access-token signature, issuer, `authenticated` audience and expiry using JWKS; protected API routes do not implement `/register`, `/login`, `/logout`, or refresh-session endpoints. This is consistent with the TDD architecture where the client uses Supabase Auth and sends its access token to the backend. Registration should be tested against Supabase Auth, not expected as a backend route.

The setup guide still says public self-registration/admission policy is undecided. The auth resolver defaults a valid user with no `app_metadata.role` to `student`; explicit unsupported roles are rejected. Before enabling public sign-up, decide admission rules, email confirmation and consent for under-18 users. Registration E2E also needs a dedicated test mailbox and the project's public publishable/anon key; never use a service-role key in the client or test harness.

### 4.3 Data model differences from TDD

The current 13 application tables are: `profiles`, `career_goals`, `missions`, `rubric_versions`, `rubric_criteria`, `submissions`, `assessment_runs`, `assessment_criterion_results`, `xp_events`, `learning_preferences`, `daily_activities`, `user_progress`, and `user_achievements`.

TDD's conceptual model additionally proposes `submission_assets` and `assessment_reviews`, neither of which exists. `submission_assets` can remain out of scope while text-only is selected. `assessment_reviews` is needed if mandatory human review is to be represented as a durable, auditable workflow. TDD also proposes mission category/scenario/output metadata, rubric score bounds/order, and richer assessment provenance (`source`, model, raw result, error code); these should be added only where needed by the finalized rubric/review contract.

### 4.4 Authorization and database policy

The inspected application queries generally scope private data using the verified JWT user ID. However, the runtime DB role has `BYPASSRLS`, and RLS is disabled with no policies on application tables. TDD explicitly warns against treating a privileged connection as end-user isolation. Before real student data/pilot, use a least-privilege runtime role without `SUPERUSER` or `BYPASSRLS`, grant only required operations, and decide/implement the RLS context strategy. Add cross-user tests for profile, career goals, submissions, assessments, progression and dashboard.

### 4.5 Mission visibility differs between TDD and implementation

The TDD's initial API table marks `GET /api/v1/missions` and mission detail as `Student`; the live OpenAPI marks both public. This may be a deliberate product choice (browse before login), but it is not recorded as a decision. Decide whether catalog browsing should be public or require a student session, then align route middleware, OpenAPI and frontend expectations.

### 4.6 Native Android direction differs from the original PRD/TDD baseline

PRD/TDD/Development Plan describe a web prototype as MVP and native mobile as future. The current product owner has changed the active client to native Android. The backend REST contract can serve either client, and CORS has been removed accordingly, but the PRD/TDD should be updated so delivery scope, test strategy and deployment assumptions are not contradictory. Responsive-browser requirements are frontend requirements and do not create backend work by themselves.

### 4.7 Operational and non-functional gaps

- No rate limiting was found for submission/assessment/auth-adjacent requests, although TDD recommends it.
- No reviewer/admin audit log exists; this becomes necessary with mandatory review.
- No explicit retention/deletion workflow or under-18 consent integration exists. PRD/TDD mark these as privacy/pilot readiness concerns and some details remain open.
- No GitHub Actions CI workflow or lint script exists. TDD expects PR checks for lint/typecheck/tests; CI/CD remains a separate implementation task. User's earlier target is Alpha deploy after push/manual trigger and Production manual promotion.
- The backend has centralized error handling and request IDs, and submission text is bounded at 20,000 characters.
- There is no file storage implementation; this is currently consistent with the text-only submission decision.

### 4.8 Explicitly out of scope — not counted as drift

The following PRD items are outside MVP: CV scanner, complex personalized learning path, role-fit analysis, actual job/company recommendations, interview simulator, complex industry panel, institution dashboard, licensing/billing and job placement. Their absence from this backend is correct unless scope is formally changed.

## 5. Remediation plan and execution order

Work must remain backend-only. Each code or schema change is developed on a branch, validated, opened as a PR, reviewed, merged to `main`, and then deployed to Alpha when relevant. Do not deploy Production during this plan.

### Phase 0 — Resolve critical security and policy blockers

**P0.1 Least-privilege database runtime**

1. Design a dedicated Alpha runtime DB role with no superuser and no `BYPASSRLS`; keep the existing migration owner separate.
2. Define minimum table/schema grants required by current backend queries.
3. Decide whether request-scoped user context and RLS policies will be enforced. If yes, implement a transaction-scoped context strategy compatible with Hyperdrive; if no, document the backend-ownership model and retain RLS as a future defense layer, but do not claim RLS protection.
4. Update the Alpha Hyperdrive origin to the runtime role without putting its password in Git or chat.
5. Verify role attributes, grants, and cross-user isolation before using real student data.

**Acceptance:** Hyperdrive connects using the least-privilege role; role has `rolsuper=false` and `rolbypassrls=false`; normal API paths still work; User A cannot read or mutate User B's data; migration owner remains separate.

**P0.2 Reviewer authorization decision**

Product owner must decide how mandatory review is authorized while the public/product role set remains student-only. Do not implement reviewer endpoints until this is explicit.

**P0.3 Signup/admission decision**

Decide whether Alpha allows self-registration, invitation-only accounts, email confirmation, allowed domains and under-18 consent. Keep signup testing isolated to Alpha and use a dedicated test identity.

### Phase 1 — Make the Discover and Practice path testable

1. Decide how a student who is unsure of a career goal is represented (explicit exploration goal, optional goal list, or another product-approved model).
2. Decide whether mission catalog browsing is public or student-authenticated, then align TDD/OpenAPI/runtime.
3. Select the pilot missions and approved rubric content. Do not invent production mission content in backend seed data.
4. Add reviewed Alpha seed/migration data for the selected published missions and rubric versions.
5. Keep submission text-only. Validate valid/invalid text, max length, mission publication state, rubric version linkage and ownership.

**Acceptance:** Alpha has at least the product-approved pilot catalog; published mission list/detail expose context, instructions, expected text output and rubric; unpublished missions cannot be submitted; submission is stored with the active rubric version and verified JWT owner.

### Phase 2 — Implement mandatory assessment review

After reviewer authorization is decided:

1. Add a durable review model (likely `assessment_reviews`) with reviewer identity, status, notes/changes and finalization timestamps.
2. Add criterion evidence to assessment results so feedback can cite the student's actual output.
3. Define valid state transitions for queued, draft/provisional, needs-review, finalized and failed.
4. Implement trusted reviewer queue/read/review actions with ownership/assignment checks and audit events.
5. Ensure student endpoints never expose a result as final before the mandatory review is complete.
6. Keep AI processing separate from finalization; a queued request must not imply a completed assessment.

**Acceptance:** A submission can be queued, reviewed by an authorized reviewer, corrected/finalized, and then displayed to its owner. A student cannot self-review, finalize, change scores, or access another student's submission. Duplicate requests are idempotent.

### Phase 3 — Complete progression, dashboard and recommendations

1. Product owner approves XP event triggers, amounts, level thresholds, streak behavior and achievement thresholds. Until approval, zero active XP remains the safe behavior.
2. Verify XP event idempotency and that client input cannot set XP/level.
3. Extend dashboard to include available final assessment/feedback data without conflating XP with competency.
4. Improve recommendations only when approved rubric-gap data exists; preserve explainable reasons and avoid career-fit/employment predictions.

**Acceptance:** XP is awarded once per approved event; progress, activity and dashboard agree; final rubric evidence is distinguishable from provisional assessment; recommendation results come only from published missions and provide a truthful basis.

### Phase 4 — AI feedback (PRD Should)

1. Confirm Groq model and API key management.
2. Implement a provider adapter, bounded prompt input, Zod output validation and rubric-version matching.
3. Treat submission text as untrusted data; test prompt-injection resistance.
4. Handle timeout, 429, 5xx, invalid output and insufficient evidence without producing fake scores.
5. Build an evaluation set reviewed by humans and compare AI results to human rubric judgments.
6. Store AI output as provisional; require human review before finalization.

**Acceptance:** AI output passes schema/domain validation, cites evidence from the submission, never invents criteria, and cannot finalize a score without the required reviewer action.

### Phase 5 — Hardening and release readiness

1. Add rate limiting and request-size/time limits appropriate to Alpha.
2. Add privacy-safe audit events for reviewer and other sensitive actions.
3. Define retention/deletion and under-18 consent procedures with the product owner/school; implement backend support only after policy is approved.
4. Add GitHub Actions CI for typecheck, tests, migration validation and dependency audit. Keep Production deployment manual, separate from Alpha.
5. Update PRD/TDD to reflect native Android as the active client and the final role/admission/reviewer decisions.

**Acceptance:** PR checks are required; Alpha has repeatable smoke/E2E scripts; secrets are not committed; no Production deploy is triggered by the Alpha workflow; privacy/security checklist is reviewed before pilot.

## 6. Required E2E acceptance matrix

| Journey | Required checks |
|---|---|
| Registration/auth | Supabase Auth signup per approved policy, email confirmation if enabled, sign-in, access token claims, invalid/expired token, sign-out/session revocation behavior. Signup is tested against Supabase Auth, not a backend `/register` route. |
| Onboarding/profile | First profile initialization; profile update; career goal create/replace/delete; invalid goal list; primary goal deletion conflict; undecided/exploration path. |
| Mission catalog | Published list, pagination/limit bounds, detail/rubric, missing/unpublished mission, public-vs-auth decision. |
| Submission | Text valid, empty, whitespace, max length, too long, unpublished mission, missing rubric, owner identity from JWT, duplicate/retry behavior. |
| Assessment/review | Queue creation, request reuse/idempotency, invalid state, reviewer authorization, mandatory review, score/evidence validation, finalization gate, provider failure. |
| Progression | Default preference, timezone validation, daily goal bounds, activity date/streak, XP remains zero while provisional, approved event once, achievement threshold. |
| Dashboard | Summary matches submissions/assessments/progress, user-scoped data, provisional vs final labeling. |
| Recommendations | Goal keyword match, catalog fallback, exclude attempted missions, no recommendations when catalog is empty, explainable basis. |
| Security | Missing/invalid/expired token, unsupported role, nested-route auth, User A vs User B access across every private resource, least-privilege DB role/RLS strategy. |
| Runtime | Health, DB health, OpenAPI, native Android requests (no CORS dependency), Alpha deployment version and binding verification. |

## 7. Product-owner decisions required before blocked work

1. **Reviewer identity:** keep only `student` as the product role and use a trusted internal review mechanism, or authorize an internal-only `reviewer` claim? Mandatory review cannot be implemented safely until this is decided.
2. **Registration:** is Alpha self-registration enabled for test users, or invitation-only? What email confirmation/admission policy applies?
3. **Career exploration:** how should a student who is unsure proceed without being forced to choose a definite career goal?
4. **Mission pilot:** which missions and rubrics are approved for Alpha seed data?
5. **XP policy:** which events award XP, what values/thresholds apply, and when can policy status become `approved`?
6. **Mission catalog visibility:** public before sign-in or student-authenticated, given the TDD/OpenAPI discrepancy?
7. **Mobile scope:** formally update PRD/TDD from web MVP/future mobile to native Android as the active client.

## 8. Execution status at plan creation

- [x] Alpha Hyperdrive metadata verified through Wrangler CLI.
- [x] Alpha Worker deployed and health/database/OpenAPI endpoints verified.
- [x] Alpha DB migrations `0000`–`0003` applied through IPv4 Session Pooler.
- [x] Nested career-goal delete auth gap fixed in PR #10 and redeployed to Alpha.
- [x] CORS removed for native Android in PR #11 and redeployed to Alpha.
- [x] 17 protected operations return 401 without a token.
- [ ] Full authenticated Alpha E2E — blocked on test account/access token and approved signup policy.
- [ ] Published mission E2E — blocked on approved pilot mission/rubric seed data.
- [ ] Assessment/review E2E — blocked on reviewer authorization and missing implementation.
- [ ] Least-privilege DB role/RLS hardening — required before real student data/pilot.
- [ ] AI feedback — PRD Should; not implemented.
- [ ] XP activation — blocked until progression policy is approved.
- [ ] CI/CD workflow — not implemented.

This plan is the execution checklist. Update its status after each PR; do not mark a requirement complete based only on a schema, route declaration, or successful health check.
