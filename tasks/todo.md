# SkillBridge Backend — Task Checklist

**Status:** Plan approved. Foundation dan slice awal telah dikerjakan; item yang memerlukan Supabase project atau kebijakan produk tetap terbuka.

## Approved MVP Decisions — 2026-11-25

- [x] Product roles: `student` only. Reviewer/admin are not MVP user roles. The auth boundary accepts only a verified `app_metadata.role` of `student`; an absent role claim retains the existing student default, while any explicit unsupported/malformed role is rejected with HTTP 403.
- [x] Assessment review: mandatory human review before any assessment can be finalized. Reviewer identity, authorization channel, assignment and audit trail remain **TBD**; do not add reviewer endpoints or automatic finalization while these are unresolved.
- [x] Submission: text-only (`content` string). File/image/video attachments, upload handlers, asset tables and Storage are out of MVP scope.

### Remaining product/infrastructure decisions — TBD

- Frontend GitHub repository creation/ownership, domains, deployment environments and API origins. Frontend architecture is selected in ADR 0007.
- Student registration/admission policy and how student role claims are provisioned in Supabase.
- Trusted reviewer identity/access path despite there being no reviewer product role; reviewer assignment, audit trail and review SLA.
- Rubric criteria, scale, weights, versioning, and provisional-feedback visibility to students.
- Assessment execution mode/queue, retry and timeout policy, Groq model and structured-output contract.
- XP rewards and progression values; retention/deletion and under-18 privacy/consent policy.
- Supabase signing configuration, runtime DB role, RLS user-context strategy, Hyperdrive and deployment credentials.

## Approved Frontend Integration Decisions — 2026-11-25

- [x] React + TypeScript + Vite SPA; no SSR for the authenticated student MVP.
- [x] React Router for client routing and TanStack Query for API server state; no global state library until a concrete need exists.
- [x] Supabase JS is used for Auth/session only. Browser product data goes through the backend REST API; no direct Supabase Data API/PostgreSQL access.
- [x] Backend OpenAPI snapshot is the API contract source. Frontend uses `openapi-typescript` generated path types and `openapi-fetch`; update the mirrored snapshot and generated types in the same frontend PR.
- [x] Deploy frontend separately as a Cloudflare Worker with Static Assets through the Cloudflare Vite plugin; configure exact `CORS_ORIGINS` on the backend.
- [x] Product API envelope: `{ success: true, data }` / `{ success: false, error: { code, message } }`; health endpoints are operational exceptions.
- [x] MVP UI is student-only; no reviewer/admin product interface.
- [x] Student auth/account UI scope: sign-in/out, session restore/refresh, password reset, profile and career-goal management via backend; Auth email/password changes only if provider policy enables them.
- [ ] Decide student admission: public registration vs invite/school provisioning; do not enable unrestricted signup before decision.
- [ ] Decide email verification, email/password change policy, account deletion/export and retention/privacy requirements.

See `docs/adr/0007-student-frontend-openapi-first-architecture.md`.
See `docs/setup-guide.md` for the full local-to-Cloudflare setup sequence.

## Phase 0 — Foundation

### Task 0.1 — Install dan siapkan PostgreSQL lokal

- [x] Pasang PostgreSQL dari repository Arch Linux dan inisialisasi data directory.
- [x] Aktifkan service; batasi listener development ke loopback.
- [x] Buat `skillbridge_dev`, role runtime `skillbridge_app`, dan role migrasi `skillbridge_migrator` terpisah.
- [x] Siapkan local-only fixture schema `auth.users` untuk FK dan test (tidak masuk migration produksi).

**Acceptance:** PostgreSQL 18 berjalan; role aplikasi dapat terhubung ke database lokal; akses jaringan hanya loopback; `SELECT 1` berhasil. Catatan: pg_hba saat ini menggunakan trust rule terbatas untuk kombinasi database/user di 127.0.0.1 karena SCRAM password belum disetel; ganti sebelum host dipakai bersama.
**Verification:** `systemctl status postgresql`, `pg_isready`, dan koneksi `psql` sebagai role aplikasi — passed.
**Dependencies:** None. **Scope:** Medium.

### Task 0.2 — Migrasi runtime database dari D1 ke PostgreSQL/Hyperdrive

- [x] Ganti Drizzle adapter `d1` dengan `node-postgres` dan `pg` yang didukung Hyperdrive.
- [x] Evaluasi dan pin Drizzle ORM/Kit ke versi stabil kompatibel; hindari release candidate tanpa kebutuhan yang terverifikasi.
- [x] Ubah Drizzle Kit config ke PostgreSQL dan siapkan migration workflow lokal.
- [x] Ganti D1 Wrangler binding dengan Hyperdrive binding; konfigurasikan local connection string tanpa memasukkan password ke Git.
- [x] Perbarui DB health check agar melakukan `SELECT 1` melalui Drizzle/PostgreSQL.

**Acceptance:** Worker lokal dapat menjalankan query melalui binding Hyperdrive lokal; tidak ada import/config D1/SQLite yang tertinggal pada runtime aktif.
**Verification:** migration generate/apply lokal, `npm run check`, `wrangler dev`, dan `GET /health/database` — passed. Wrangler deploy dry-run masih menunggu Hyperdrive remote ID.
**Dependencies:** Task 0.1. **Scope:** Medium.

### Task 0.3 — Hono foundation, shared HTTP conventions, dan OpenAPI handoff

- [x] Pisahkan app composition (`src/app.ts`) dari Worker entry point (`src/index.ts`).
- [x] Tambahkan centralized 500 error envelope, request ID, configurable CORS, dan API base `/api/v1`.
- [x] Pertahankan `/openapi.json` sebagai generated source contract; tambahkan export `docs/openapi.json`.
- [x] Tetapkan envelope API produk untuk integrasi frontend: `{ success: true, data }` dan `{ success: false, error: { code, message } }`; health endpoints menjadi pengecualian (ADR 0007).

**Acceptance:** semua implemented routes terdokumentasi; kontrak JSON dapat diambil frontend tanpa menyalin schema manual. Envelope produk telah diputuskan; daftar origin CORS tetap dikonfigurasi per environment.
**Verification:** OpenAPI generation, typecheck dan schema tests — passed; full HTTP integration tests pending.
**Dependencies:** Task 0.2. **Scope:** Medium.

### Checkpoint — Foundation

- [x] Worker berjalan lokal menggunakan workerd melalui Wrangler.
- [x] Drizzle tersambung ke PostgreSQL lokal melalui Hyperdrive local mode.
- [x] Migration baseline dapat diterapkan ulang dari database kosong dan migrator idempotent.
- [x] OpenAPI contract dan success/error envelope tersedia untuk integrasi frontend; lihat ADR 0007.

## Phase 1 — Identity & Discover

### Task 1.1 — Profile + Supabase Auth boundary

- [x] Tambahkan profile schema dan GET/PATCH `/api/v1/me` routes.
- [x] Tambahkan middleware yang membangun auth context dari token yang benar-benar diverifikasi menggunakan Supabase JWKS.
- [x] Batasi role aplikasi MVP ke `student` dari verified `app_metadata`; tolak explicit role lain/malformed dengan HTTP 403.
- [x] Implementasikan `GET/PATCH /api/v1/me`; jangan percaya `user_id` dari body.
- [ ] Siapkan test token valid, invalid, expired dan ownership; strategi remote JWKS perlu diverifikasi setelah project tersedia.

**Acceptance:** middleware memverifikasi issuer, audience, signature dan expiry; hanya role `student` yang diterima; role lain ditolak 403; auth mengembalikan 503 jika Supabase belum dikonfigurasi. Remote token tests/cross-user tests pending project.
**Verification:** role allowlist unit tests, OpenAPI 403 contract, schema tests; remote auth integration pending Supabase project.
**Dependencies:** Task 0.3; Supabase project diperlukan untuk remote verification. **Scope:** Medium.

### Task 1.2 — Career goals slice

- [x] Tambahkan `career_goals` schema dan ownership rules.
- [x] Implementasikan `GET/PUT /api/v1/me/career-goals`.
- [x] Validasi input, replace goals secara atomik, dan dokumentasikan OpenAPI.

**Acceptance:** user dapat menyimpan/mengambil preferensi sendiri; data user lain tidak terlihat.
**Verification:** service + route tests, migration test dan OpenAPI schema check.
**Dependencies:** Task 1.1. **Scope:** Medium.

### Task 1.3 — Mission catalog dan rubric read slice

- [x] Tambahkan mission, rubric version, dan rubric criteria schema.
- [x] Implementasikan daftar mission published dan detail mission beserta rubric.
- [x] Tambahkan bounded `limit`; draft/archived tidak tersedia pada public listing/detail.

**Acceptance:** student hanya melihat mission published dan detail menunjukkan instruksi, expected output, serta rubric yang aktif.
**Verification:** tests untuk status mission, not-found, pagination, relations dan OpenAPI.
**Dependencies:** Task 0.3. **Scope:** Medium.

### Checkpoint — Discover

- [ ] User profile dan career goals terisolasi per pengguna (implementasi ownership berbasis JWT selesai; remote token/cross-user integration tests menunggu Supabase).
- [x] Student dapat menemukan mission published dan membaca rubric.
- [x] OpenAPI sesuai route aktif dan dapat dipakai frontend.

## Phase 2 — Practice & Assess

### Task 2.1 — Text-first mission submission

- [x] Tambahkan submission schema dan routes dengan rubric version reference.
- [x] Implementasikan `POST /api/v1/missions/:missionId/submissions` dan own history.
- [x] Validasi mission published, batas konten dan ownership; user ID dari auth context.
- [x] Tetapkan scope MVP text-only; tidak menerima attachment atau asset upload.

**Acceptance:** submission tersimpan terkait user, mission dan rubric version yang tepat; client tidak dapat mengirim identitas atau skor.
**Verification:** valid/invalid payload, mission unavailable, retry/duplicate, user isolation dan OpenAPI tests.
**Dependencies:** Task 1.1 dan 1.3. **Scope:** Medium.

### Task 2.2 — Assessment lifecycle dan rubric result

- [x] Tambahkan assessment run dan criterion result models.
- [x] Tambahkan owner-scoped GET submission detail, POST assessment request, dan GET latest assessment status.
- [x] Cegah duplicate active request dengan mengunci row submission; retry baru hanya diizinkan setelah run berstatus failed; finalized run diblokir.
- [x] Dokumentasikan bahwa endpoint hanya merekam status queued dan belum memulai worker/AI processing; tidak ada score atau feedback yang diklaim tersedia.
- [x] Enforce keputusan bahwa hanya student yang menjadi role pengguna produk MVP; tidak ada reviewer/admin endpoint.
- [ ] Tentukan jalur trusted reviewer di luar role pengguna produk (identity, authorization, assignment, audit trail dan SLA).
- [ ] Pilih dan implementasikan assessment processor (sync atau queue/worker) setelah keputusan execution mode, model Groq dan rubric tersedia.
- [ ] Definisikan state transition queued/processing/draft_ready/needs_review/finalized/failed: hasil AI hanya draft/provisional, review manusia wajib, dan `is_final=true` hanya setelah reviewer berwenang menyetujui.
- [ ] Putuskan apakah draft/feedback provisional dapat ditampilkan kepada student sebelum human review.
- [ ] Tambahkan reviewer operations endpoint hanya setelah jalur trusted reviewer dan authorization policy disetujui; jangan menambah `reviewer` sebagai product role tanpa keputusan baru.

**Acceptance:** request/status API owner-only untuk student; repeat request tidak menggandakan run; failed dapat dicoba ulang; finalized tidak dapat dimulai ulang; mandatory human review menjadi satu-satunya jalur finalisasi; saat ini hanya request record `queued`, tanpa AI/scoring/finalisasi.
**Verification:** PostgreSQL integration tests untuk request, reuse, failed retry, finalized blocking dan ownership; OpenAPI contract coverage.
**Dependencies:** Task 2.1 dan keputusan reviewer access/rubric/processor. **Scope:** Medium.

### Task 2.3 — Groq feedback provider (Should / gated)

- [ ] Tambahkan adapter Groq di boundary provider; secret hanya dari Worker secrets.
- [ ] Bangun prompt berbasis brief, rubric version dan submission yang telah dibatasi.
- [ ] Validasi struktur output dengan Zod dan aturan domain rubric; submission diperlakukan sebagai untrusted data.
- [ ] Tangani timeout, 429, 5xx, invalid output dan insufficient evidence tanpa menghasilkan skor palsu.
- [ ] Seluruh hasil provider tetap provisional dan berstatus `needs_review` sampai human reviewer yang berwenang menyetujui; provider tidak boleh memfinalisasi assessment.

**Acceptance:** feedback hanya muncul sesuai status policy; output invalid ditolak; submission tidak hilang saat provider gagal.
**Verification:** provider adapter tests, fixture valid/invalid, timeout/rate-limit tests dan prompt-injection regression case.
**Dependencies:** Task 2.2 dan keputusan model Groq/human review. **Scope:** Medium.

### Checkpoint — Practice & Assess

- [ ] Submission aman dan persisten.
- [ ] Assessment lifecycle tidak mencampur AI draft dengan hasil final.
- [ ] Human-review policy tercermin pada authorization dan response contract.
- [ ] Provider failure tidak membuat status sukses atau skor default.

## Phase 3 — Improve & Progress

### Task 3.1 — XP event ledger

- [x] Tambahkan `xp_events` dan source/idempotency constraint pada schema.
- [x] Implementasikan pencatatan XP dari event submission di dalam transaksi backend; retry event yang sama tidak menggandakan poin/aktivitas.
- [x] Tambahkan daily XP goal, timezone IANA per user, daily activity, current/longest streak, level thresholds dan achievement unlocks.
- [x] Expose GET/PUT preferences, GET progress, GET activity, GET achievements, dan GET policy melalui Zod/OpenAPI.
- [ ] Dapatkan product sign-off untuk nominal reward, thresholds, daily goal bounds dan achievement milestones sebelum mengubah status policy menjadi `approved`.

**Acceptance:** request client tidak dapat menaikkan XP; aktivitas submission dicatat backend-only; event retry idempotent; streak memakai timezone user; nilai XP/level tidak digabungkan dengan skor kompetensi. Reward efektif 0 sampai policy disetujui.
**Verification:** timezone/streak/level/policy tests; PostgreSQL integration tests membuktikan idempotensi dan provisional zero-reward; OpenAPI route coverage. 23 tests pass, migration generate/apply, audit and Worker dry-run pass. **Scope:** Medium.

**Current implementation:** `GET /api/v1/progression/policy`, `GET/PUT /api/v1/me/learning-preferences`, `GET /api/v1/me/progress`, `GET /api/v1/me/activity`, and `GET /api/v1/me/achievements`. Policy JSON can be supplied through `PROGRESSION_POLICY_JSON`; default reward values are provisional and effective XP is 0 until approved. Activity rows are created from successful submission events in the same transaction as the submission.

### Task 3.2 — Student dashboard dan recommendation slice

- [x] Agregasikan mission/submission/assessment status dan XP dari source of truth.
- [x] Implementasikan `GET /api/v1/me/dashboard` dengan status assessment saja; skor/feedback tidak dipalsukan atau disajikan sebelum tersedia sesuai policy.
- [x] Implementasikan `GET /api/v1/me/recommendations` berbasis overlap keyword tujuan karier terhadap judul/ringkasan mission published; fallback ke katalog mission yang belum dicoba.
- [x] Sertakan basis, matched terms, dan alasan rekomendasi yang dapat dibaca pengguna; jangan menyatakan prediksi career fit atau employment.

**Acceptance:** dashboard hanya berisi data user sendiri; provisional/final dibedakan; recommendation tidak menyatakan job placement atau kepastian career fit.
**Verification:** PostgreSQL dashboard integration test; pure recommendation tests untuk goal-match, attempted-mission exclusion, fallback dan empty catalogue; OpenAPI route coverage.

**Current implementation:** dashboard query is derived from user-owned submissions, published missions, assessment run status and progression source records. Recommendation query only reads published catalog missions and excludes mission IDs already present in the learner's submissions.
**Dependencies:** Task 1.2, 1.3, 2.1, 2.2 dan 3.1. **Scope:** Medium.

### Checkpoint — Improve

- [ ] Dashboard cocok dengan riwayat yang tersimpan.
- [ ] XP terpisah dari skor rubric.
- [ ] Recommendation hanya menunjuk mission yang tersedia dan dapat dijelaskan.

## Phase 4 — Hardening & handoff

### Task 4.1 — Security, privacy, database isolation dan deployment readiness

- [ ] Uji least-privilege DB role dan strategi RLS; buktikan akses silang User A/User B gagal.
- [ ] Review CORS, input bounds, rate limits, error redaction, secret handling dan dependency audit.
- [ ] Dokumentasikan data minimization, retention/deletion dan approval untuk peserta di bawah umur.
- [ ] Siapkan staging Hyperdrive/Supabase smoke test dan rollback checklist saat credentials/project tersedia.

**Acceptance:** tidak ada endpoint privat tanpa auth/ownership; tidak ada secret/data siswa di log atau response error; staging check terdokumentasi.
**Verification:** security checklist, cross-user tests, `npm audit`, migration test, Worker build dan deployment smoke tests.
**Dependencies:** seluruh feature slices yang masuk scope. **Scope:** Medium.

### Task 4.2 — Frontend API handoff dan dokumentasi akhir

- [x] Export OpenAPI dari route definitions yang sama; jangan memelihara kontrak duplikat manual.
- [x] Dokumentasikan auth header, error codes, pagination, local setup dan environment variables.
- [x] Catat keputusan teknis awal dalam ADR serta tandai open decisions yang masih menunggu Supabase/product policy.

**Acceptance:** frontend dapat mengembangkan API client dan fitur berdasarkan kontrak yang versioned serta dapat direproduksi.
**Verification:** OpenAPI validator, contoh request smoke tests dan README quick-start review.
**Dependencies:** Task 0.3 dan route feature yang sudah disetujui. **Scope:** Small/Medium.

### Task 4.3 — Bootstrap frontend repository and typed API boundary

- [ ] Create/confirm the separate frontend repository and deployment ownership.
- [ ] Scaffold React + TypeScript + Vite with the Cloudflare Vite plugin and Static Assets deployment.
- [ ] Add React Router, TanStack Query, Supabase Auth client, `openapi-typescript`, and `openapi-fetch`.
- [ ] Import the reviewed backend OpenAPI snapshot and generate typed API paths/client.
- [ ] Configure environment-specific API origins and exact backend CORS allowlist.

**Acceptance:** frontend builds and previews on Cloudflare Workers locally; login/session can provide a bearer token to the typed API client; a student-only route can call one protected backend endpoint without direct database access.
**Verification:** typecheck, unit tests, Worker/Vite build and preview, auth/API smoke tests with a configured Supabase project.
**Dependencies:** frontend repository and Supabase project/environment values. **Scope:** Medium.

### Final checkpoint — MVP backend readiness

- [ ] Route dan schema OpenAPI sama dengan implementasi.
- [ ] Unit/integration/runtime tests lulus.
- [ ] Local Worker dan PostgreSQL development dapat dijalankan dari README.
- [ ] Security/ownership/RLS limits ditinjau dan dicatat.
- [ ] Staging Supabase/Hyperdrive tervalidasi saat project/credentials tersedia.
- [ ] Tidak ada source change yang di-commit ke `main` secara langsung.
