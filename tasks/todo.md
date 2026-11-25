# SkillBridge Backend — Task Checklist

**Status:** Plan approved. Foundation dan slice awal telah dikerjakan; item yang memerlukan Supabase project atau kebijakan produk tetap terbuka.

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
- [ ] Review success/error envelope dengan Frontend Lead sebelum endpoint produk pertama.

**Acceptance:** semua implemented routes terdokumentasi; kontrak JSON dapat diambil frontend tanpa menyalin schema manual. Central error envelope/request ID/CORS masih perlu difinalkan.
**Verification:** OpenAPI generation, typecheck dan schema tests — passed; full HTTP integration tests pending.
**Dependencies:** Task 0.2. **Scope:** Medium.

### Checkpoint — Foundation

- [x] Worker berjalan lokal menggunakan workerd melalui Wrangler.
- [x] Drizzle tersambung ke PostgreSQL lokal melalui Hyperdrive local mode.
- [x] Migration baseline dapat diterapkan ulang dari database kosong dan migrator idempotent.
- [x] OpenAPI contract tersedia untuk frontend; success/error envelope masih menunggu kesepakatan Frontend Lead.

## Phase 1 — Identity & Discover

### Task 1.1 — Profile + Supabase Auth boundary

- [x] Tambahkan profile schema dan GET/PATCH `/api/v1/me` routes.
- [x] Tambahkan middleware yang membangun auth context dari token yang benar-benar diverifikasi menggunakan Supabase JWKS.
- [x] Implementasikan `GET/PATCH /api/v1/me`; jangan percaya `user_id` dari body.
- [ ] Siapkan test token valid, invalid, expired dan ownership; strategi remote JWKS perlu diverifikasi setelah project tersedia.

**Acceptance:** middleware memverifikasi issuer, audience, signature dan expiry; auth mengembalikan 503 jika Supabase belum dikonfigurasi. Remote token tests/cross-user tests pending project.
**Verification:** OpenAPI contract tests dan schema tests passed; remote auth integration pending.
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

**Acceptance:** submission tersimpan terkait user, mission dan rubric version yang tepat; client tidak dapat mengirim identitas atau skor.
**Verification:** valid/invalid payload, mission unavailable, retry/duplicate, user isolation dan OpenAPI tests.
**Dependencies:** Task 1.1 dan 1.3. **Scope:** Medium.

### Task 2.2 — Assessment lifecycle dan rubric result

- [x] Tambahkan assessment run dan criterion result models.
- [ ] Definisikan state transition queued/processing/draft_ready/needs_review/finalized/failed sesuai kebijakan yang disepakati.
- [ ] Pisahkan hasil otomatis provisional dari hasil final; jangan menampilkan skor final sebelum syarat finalisasi terpenuhi.
- [ ] Tambahkan reviewer route hanya setelah role, assignment dan authorization policy disetujui.

**Acceptance:** assessment status dan hasil tersimpan konsisten serta tidak dapat difinalisasi oleh student/client.
**Verification:** transition tests, invalid transition, criterion range, ownership dan review-policy tests.
**Dependencies:** Task 2.1 dan keputusan reviewer/rubric. **Scope:** Medium.

### Task 2.3 — Groq feedback provider (Should / gated)

- [ ] Tambahkan adapter Groq di boundary provider; secret hanya dari Worker secrets.
- [ ] Bangun prompt berbasis brief, rubric version dan submission yang telah dibatasi.
- [ ] Validasi struktur output dengan Zod dan aturan domain rubric; submission diperlakukan sebagai untrusted data.
- [ ] Tangani timeout, 429, 5xx, invalid output dan insufficient evidence tanpa menghasilkan skor palsu.

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
- [ ] Implementasikan pemberian XP hanya dari event backend yang diizinkan.
- [ ] Hitung level dari aturan terkonfigurasi; jangan satukan XP dan competency score.

**Acceptance:** request client tidak dapat menaikkan XP; event retry tidak menggandakan XP.
**Verification:** unit tests kalkulasi level, duplicate event integration tests dan transaction tests.
**Dependencies:** Task 2.1/2.2 dan keputusan aturan XP. **Scope:** Medium.

### Task 3.2 — Student dashboard dan recommendation slice

- [ ] Agregasikan mission/submission/assessment status dan XP dari source of truth.
- [ ] Implementasikan `GET /api/v1/me/dashboard`.
- [ ] Implementasikan recommendation berbasis aturan sederhana dari mission published, tujuan dan hasil rubric yang memang tersedia.

**Acceptance:** dashboard hanya berisi data user sendiri; provisional/final dibedakan; recommendation tidak menyatakan job placement atau kepastian career fit.
**Verification:** aggregation tests, cross-user test, empty state dan OpenAPI validation.
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

### Final checkpoint — MVP backend readiness

- [ ] Route dan schema OpenAPI sama dengan implementasi.
- [ ] Unit/integration/runtime tests lulus.
- [ ] Local Worker dan PostgreSQL development dapat dijalankan dari README.
- [ ] Security/ownership/RLS limits ditinjau dan dicatat.
- [ ] Staging Supabase/Hyperdrive tervalidasi saat project/credentials tersedia.
- [ ] Tidak ada source change yang di-commit ke `main` secara langsung.
