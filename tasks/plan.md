# Rencana Backend SkillBridge — Vertical Slice Architecture

**Status:** Approved; foundation dan feature slices awal sudah diimplementasikan secara parsial
**Scope:** Backend repository ini saja. Frontend tidak diimplementasikan dalam rencana ini.
**Target runtime:** Cloudflare Workers (Hono)
**Database:** Supabase PostgreSQL, diakses melalui Drizzle ORM dan Cloudflare Hyperdrive

## 1. Sumber dan hasil inspeksi

Rencana ini menggunakan tiga dokumen di `coverage/ProjectSpecifications/Documents/` sebagai sumber utama:

- `Product Requirement Document`: batas MVP, persona, acceptance criteria, Discover → Practice → Assess → Improve.
- `TECHNICAL DESIGN DOCUMENT (TDD)`: model data, REST API, auth, RLS, AI assessment, reliability dan deployment.
- `Technical Development Plan` / `DEVELOPMENT HANDBOOK`: kesepakatan tim, stack, tahap delivery dan Definition of Done.

Repository sudah memiliki starter Hono + TypeScript, Zod/OpenAPI, Drizzle, dan Wrangler. Endpoint `GET /health`, `GET /health/database`, dan `GET /openapi.json` sudah ada. Namun database starter masih D1/SQLite; bagian itu perlu diganti dengan PostgreSQL. Tidak ada tabel/fitur produk yang perlu dimigrasikan dari D1 pada tahap ini. Starter saat ini memakai Drizzle `1.0.0-rc.6`; registry npm saat perencanaan menunjukkan rilis stabil `drizzle-orm 0.45.4` dan `drizzle-kit 0.31.11`. Task database akan memilih pasangan stabil yang kompatibel dengan pola Hyperdrive, kecuali ada alasan teknis teruji untuk tetap memakai release candidate.

Di host Arch Linux, PostgreSQL belum terpasang. Paket repository yang terdeteksi adalah `postgresql 18.7-1`. Wrangler `4.168.0` dan `workerd 1.20261123.1` sudah menjadi dependency proyek dan `wrangler dev` pernah berhasil berjalan; runtime Worker terpasang secara lokal melalui dependency proyek, sehingga tidak perlu memasang runtime global yang kedua.

## 2. Arsitektur target

Gunakan **Vertical Slice Architecture (VSA) di dalam satu modular monolith**. Satu aplikasi Hono/Worker tetap menjadi satu unit deploy, tetapi setiap feature memiliki jalur vertikalnya sendiri: route/handler, kontrak Zod + OpenAPI, use-case/service, repository Drizzle, definisi tabel milik feature, dan test. Hindari memisahkan aplikasi menjadi microservices untuk MVP.

Struktur target yang diusulkan:

```text
src/
├── index.ts                 # Worker entry point
├── app.ts                   # Hono composition dan registrasi OpenAPI routes
├── shared/
│   ├── auth/                 # Verified Supabase identity/context
│   ├── config/               # Env/bindings validation
│   ├── db/                   # PostgreSQL client, Drizzle schema registry
│   ├── http/                 # Error envelope, response helpers
│   └── middleware/           # Request ID, auth, CORS dan error boundary
└── features/
    ├── profiles/
    ├── career-goals/
    ├── missions/             # Mission + published rubric read model
    ├── submissions/
    ├── assessments/          # AI draft + human-review lifecycle
    ├── gamification/         # XP ledger; terpisah dari skor kompetensi
    ├── dashboard/
    └── recommendations/
```

Di dalam setiap feature, file cukup ditambahkan saat dibutuhkan—misalnya `*.routes.ts`, `*.schemas.ts`, `*.service.ts`, `*.repository.ts`, `*.schema.ts`, dan `*.test.ts`. Jangan membuat lapisan atau abstraksi kosong untuk semua kemungkinan fitur. `shared/` hanya berisi kemampuan lintas feature, bukan business logic feature.

### Aliran satu request

`Cloudflare Worker → Hono middleware → OpenAPI/Zod boundary → feature route → service/use-case → repository → Drizzle/PostgreSQL`.

Identitas berasal dari token Supabase yang telah diverifikasi di backend. Untuk MVP, satu-satunya role aplikasi yang diterima adalah `student`, dibaca dari claim server-controlled `app_metadata.role`; role dari body atau `user_metadata` tidak dipercaya. Claim role eksplisit yang tidak didukung ditolak dengan 403. `user_id`, skor assessment, status final, atau nominal XP dari body client tidak pernah menjadi sumber kebenaran. Frontend hanya berkomunikasi melalui REST API; frontend tidak mengakses tabel produk secara langsung.

## 3. Database dan runtime lokal

### PostgreSQL lokal

1. Pasang paket Arch `postgresql` setelah rencana disetujui.
2. Inisialisasi data directory PostgreSQL, aktifkan service systemd, dan pastikan listener hanya tersedia di loopback untuk development.
3. Buat database `skillbridge_dev` serta role aplikasi lokal dengan privilege minimum. Pisahkan role migrasi dari role runtime jika memungkinkan.
4. Verifikasi koneksi melalui `psql` dan `SELECT 1`.

TDD menghubungkan `profiles.id` ke `auth.users.id`. PostgreSQL lokal biasa belum memiliki schema Supabase Auth. Karena Supabase project belum dibuat, test lokal akan memakai fixture/bootstrap `auth.users` lokal yang tidak masuk ke migration produksi. Migration produksi tetap mengandalkan Supabase Auth sebagai pemilik `auth.users`.

### Worker lokal dan Hyperdrive

- Gunakan `wrangler dev` yang sudah tersedia di proyek; Wrangler menjalankan Worker lokal melalui `workerd`.
- Gunakan Drizzle `drizzle-orm/node-postgres` dan driver `pg` (versi minimal mengikuti dokumentasi Cloudflare saat implementasi, saat ini didokumentasikan `pg` 8.16.3 atau lebih baru).
- Pada local mode, arahkan binding Hyperdrive ke PostgreSQL lokal menggunakan `localConnectionString` atau `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- Local mode terhubung langsung ke PostgreSQL sehingga caching dan connection pooling Hyperdrive tidak berjalan secara lokal. Tujuan pengujian lokal adalah kompatibilitas Worker, query Drizzle dan behavior API; perilaku pooling/cache baru diuji pada Hyperdrive Cloudflare.
- Untuk environment Cloudflare, buat Hyperdrive configuration yang mengarah ke Supabase PostgreSQL setelah Supabase project dan connection string tersedia. Runtime Worker memakai `env.HYPERDRIVE.connectionString`; jangan menyimpan password di source code atau file yang di-commit.

Referensi implementasi resmi:

- [Cloudflare — Drizzle ORM with Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/)
- [Cloudflare — Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/)
- [Cloudflare — Supabase integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/)

### Supabase boundaries

- Supabase Auth menjadi identity provider. Backend menerima Bearer access token dan memverifikasi token sesuai signing algorithm project yang benar-benar dipakai. Strategi JWKS vs Auth `/user` endpoint baru dipastikan setelah Supabase project tersedia. Role MVP hanya `student`; cara pendaftaran/kelayakan akun siswa masih TBD.
- Supabase PostgreSQL menjadi source of truth. Migration dibuat dan diuji terhadap PostgreSQL lokal terlebih dahulu; migration production dijalankan terpisah setelah project disiapkan.
- Supabase Storage dan attachment tidak masuk scope MVP: submission disetujui text-only dan memakai satu field `content`.
- Jangan menggunakan `service_role`/superuser untuk menganggap RLS otomatis melindungi user. Backend wajib melakukan ownership authorization. Pilih runtime DB role terbatas tanpa `BYPASSRLS`; propagasi user context untuk RLS harus dirancang dan diuji secara eksplisit. Migration role dan runtime role dipisahkan.

## 4. API contract untuk frontend

- API berbentuk REST/JSON dengan base path `/api/v1`; `/health` tetap endpoint publik.
- `@hono/zod-openapi` menjadi sumber kebenaran kontrak: request, path/query, response, dan error dideskripsikan dengan Zod lalu didaftarkan menggunakan `createRoute` / `app.openapi(...)`.
- `GET /openapi.json` menyediakan spesifikasi yang dihasilkan dari route definitions, bukan dokumen yang ditulis manual terpisah. Setelah kontrak awal disepakati, sediakan export artefak OpenAPI statis untuk handoff/versi frontend bila diperlukan.
- **Keputusan envelope (APPROVED):** frontend mengikuti bentuk yang sudah dipakai API produk, yaitu sukses `{ success: true, data }` dan error `{ success: false, error: { code, message } }`. HTTP status tetap sumber kebenaran. `requestId` bersifat metadata diagnostik opsional. Endpoint operasional `/health` dan `/health/database` dikecualikan dari envelope produk.
- Gunakan UUID untuk resource ID, ISO 8601 UTC untuk timestamp, dan `limit`/`cursor` untuk koleksi yang memerlukan pagination.
- Endpoint awal mengikuti TDD: `/api/v1/me`, `/api/v1/me/career-goals`, `/api/v1/missions`, `/api/v1/missions/:missionId`, submission, assessment, dashboard, serta recommendations. Semua endpoint aplikasi saat ini beroperasi untuk `student`; tidak ada reviewer/admin endpoint. Mandatory human review sudah diputuskan, tetapi identitas, jalur otorisasi, assignment dan audit reviewer masih TBD.

OpenAPI adalah artefak handoff bagi frontend: developer frontend dapat mengambil `/openapi.json` untuk melihat endpoint, method, auth, request schema, response schema, dan error contract sebelum/selama implementasi UI. Perubahan kontrak harus melalui review bersama Frontend Lead.

**Keputusan integrasi frontend (ADR 0007):** gunakan React + TypeScript + Vite sebagai SPA, React Router untuk navigasi, TanStack Query untuk server state, Supabase JS hanya untuk Auth, serta `openapi-typescript` + `openapi-fetch` untuk client API bertipe. Deploy UI sebagai Cloudflare Worker terpisah dengan Static Assets melalui Cloudflare Vite plugin; backend tetap Worker REST API terpisah. Kontrak satu-satunya tetap OpenAPI yang digenerate dari route Zod backend. Frontend menyimpan snapshot OpenAPI yang direview dan memperbarui generated types dalam PR frontend saat kontrak backend berubah. Tidak ada akses browser langsung ke tabel Supabase/PostgreSQL. Scope UI MVP hanya student; reviewer/admin tidak memiliki halaman aplikasi. Detail stack dan alasan tercatat di `docs/adr/0007-student-frontend-openapi-first-architecture.md`.

## 5. Model data MVP

Model logis mengikuti TDD; nama kolom, constraint final dan rubric policy harus direview sebelum migration pertama.

| Feature | Entitas utama | Catatan desain |
| --- | --- | --- |
| Profiles | `profiles`, `career_goals` | Profile ditautkan ke `auth.users.id`; simpan atribut minimum. |
| Missions | `missions`, `rubric_versions`, `rubric_criteria` | Hanya mission `published` dapat dilihat/dikerjakan; rubric version immutable untuk penilaian lama. |
| Submissions | `submissions` | MVP text-only; hanya `content` string dan `rubric_version_id`, tanpa asset table atau upload. |
| Assessments | `assessment_runs`, `assessment_criterion_results`, `assessment_reviews` (jika diperlukan setelah desain) | Human review wajib sebelum status final; hasil otomatis tetap draft/provisional sampai reviewer yang berwenang menyetujui. Reviewer access path belum ditetapkan dan tidak boleh disamakan dengan role produk `student`. |
| Gamification | `xp_events`, `learning_preferences`, `daily_activities`, `user_progress`, `user_achievements` | XP ledger backend-only/idempotent; daily activity memakai timezone pilihan user; level/achievement terpisah dari skor rubric. Reward dan milestone default tetap provisional hingga disetujui product owner. |

Constraint/index awal dari TDD: unique `missions.slug`, unique `(mission_id, version)`, unique `(rubric_version_id, criterion_key)`, index riwayat submission per user, index status mission untuk reviewer, index assessment history, index XP history, score range constraint, serta idempotency/unique constraint untuk XP event.

## 6. Urutan implementasi (vertical slices)

Setiap slice harus meninggalkan API yang berjalan dan kontrak OpenAPI yang dapat dibaca. Detail task serta acceptance criteria berada di `tasks/todo.md`.

### Phase 0 — Foundation

1. PostgreSQL lokal siap dan dapat diakses hanya dari host.
2. Ganti D1/SQLite dengan PostgreSQL + `pg` + Drizzle Node Postgres, Hyperdrive binding, local connection string, migration workflow, dan DB health check.
3. Rapikan composition Hono, shared middleware/error envelope, `/api/v1`, serta standar Zod/OpenAPI untuk API handoff.

**Checkpoint:** Worker lokal terhubung ke PostgreSQL lokal, migration dapat diulang, OpenAPI valid, typecheck/build dan smoke test lulus.

### Phase 1 — Identity & Discover

4. Profile + Supabase Auth verification: `GET/PATCH /api/v1/me`, auth context dan ownership dasar.
5. Career goals: `GET/PUT /api/v1/me/career-goals`.
6. Mission catalog/detail + published rubric: `GET /api/v1/missions` dan `GET /api/v1/missions/:missionId`.

**Checkpoint:** token invalid ditolak; user context tidak dapat dipalsukan dari body; mission draft/archived tidak terbuka untuk student; OpenAPI sesuai implementasi.

### Phase 2 — Practice & Assess

7. Text-only submission: submit mission, own submission history/detail, status dan ownership. File/image/video attachment berada di luar MVP.
8. Assessment lifecycle: run/status, rubric criterion results, provisional vs finalized. Human review wajib sebelum finalisasi; processor, rubric dan jalur akses reviewer harus disepakati/diimplementasikan terlebih dahulu.
9. Groq adapter untuk AI feedback terstruktur sebagai fitur lanjutan/should: output divalidasi Zod + domain rubric, failure/rate-limit/timeout tidak menghasilkan skor palsu, dan data pribadi diminimalkan.

**Checkpoint:** submission tetap tersimpan bila AI gagal; hasil AI invalid ditolak; skor belum final tidak disajikan sebagai final; akses User A ke submission User B ditolak.

### Phase 3 — Improve & Progress

10. Learning progression: backend mencatat submission practice secara idempotent, daily goal dan timezone, streak harian, level serta achievement. Policy JSON configurable; reward points dan achievement unlock dinonaktifkan saat policy masih provisional.
11. Dashboard dan rekomendasi berbasis aturan sederhana dari mission yang benar-benar published dan hasil yang relevan.

**Checkpoint:** dashboard diturunkan dari sumber data yang konsisten; XP tidak mengubah competency score; rekomendasi tidak membuat klaim placement/kelayakan kerja.

### Phase 4 — Hardening & handoff

12. Pengujian ownership/RLS, JWT, CORS, rate limiting, input bounds, privacy/retention, dependency audit, migration dan deployment smoke test. Finalkan export OpenAPI, README, konfigurasi environment serta dokumentasi untuk frontend.

**Exit criteria:** semua acceptance criteria PRD untuk slice yang disetujui terpenuhi; tests, typecheck dan Worker build lulus; OpenAPI merepresentasikan route aktif; tidak ada secret di repo; user isolation telah diuji; keterbatasan dan open decisions terdokumentasi.

## 7. Dependency graph

```text
Local PostgreSQL + migration baseline
                │
                ▼
Drizzle/Postgres + Hyperdrive local binding
                │
                ▼
Hono composition + shared error/auth context + OpenAPI conventions
                │
                ├───────────────┐
                ▼               ▼
          Profiles          Missions + Rubrics
                │               │
                └───────┬───────┘
                        ▼
                   Submissions
                        │
                        ▼
                   Assessments ────── Groq adapter (optional/should)
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        XP / Gamification      Dashboard
                                  │
                                  ▼
                            Recommendations
                                  │
                                  ▼
                         Security + handoff gate
```

## 8. Risiko dan mitigasi

| Risiko / ketidakpastian | Dampak | Mitigasi |
| --- | --- | --- |
| Supabase project belum tersedia | Auth/JWKS, Hyperdrive remote dan migration produksi belum dapat dibuktikan | Gunakan local PostgreSQL; adapter/Auth verification test dapat dibuat dengan fixtures; remote check menunggu project. |
| Local Hyperdrive tidak memakai pooling/cache | Hasil lokal tidak mewakili pooling Cloudflare | Uji query dan Worker behavior lokal; lakukan smoke test Hyperdrive staging saat Supabase tersedia. |
| `auth.users` tidak ada di PostgreSQL lokal biasa | FK profiles tidak dapat langsung dimigrasikan | Gunakan fixture schema lokal non-production; jangan ship fixture tersebut sebagai migration Supabase. |
| DB role melewati RLS | Data antar siswa dapat bocor | Least privilege, backend ownership checks, explicit RLS design dan cross-user tests. |
| Reviewer tidak termasuk role produk MVP | Mandatory review belum dapat dijalankan lewat API siswa tanpa jalur operasional terpisah | Jangan expose reviewer endpoint; tentukan identitas, otorisasi, assignment dan audit reviewer sebelum assessment processing/finalization. |
| Rubric dan score range belum final | Skema/hasil assessment dapat berubah | Versioning rubric; jangan mengunci bobot/ambang atau menandai AI sebagai final secara sepihak. |
| Submission file policy | Upload menambah storage dan risiko privasi | MVP telah diputuskan text-only; simpan upload sebagai scope di luar MVP. |
| Pengguna mungkin berusia di bawah 18 tahun | Risiko privasi dan persetujuan | Data minimization, no public portfolio, retention/deletion dan consent review sebelum pilot. |
| Snapshot OpenAPI frontend tertinggal dari backend | Tipe/request frontend tidak lagi mencerminkan API aktif | Setiap PR backend yang mengubah kontrak wajib mengupdate OpenAPI; frontend menyalin snapshot dan regenerate types dalam PR terpisah. |

## 9. Keputusan yang masih diperlukan

Keputusan ini tidak menghalangi foundation lokal, tetapi harus dibahas sebelum feature terkait dibuka:

1. **APPROVED:** Frontend mengikuti envelope API produk yang sudah aktif (`{ success: true, data }` / `{ success: false, error: { code, message } }`); status HTTP authoritative, `requestId` opsional, health endpoints dikecualikan.
2. **APPROVED:** Role produk MVP hanya `student`. Tidak ada role produk `reviewer` atau `admin`; identitas dan jalur otorisasi manusia yang melakukan review tetap **TBD**. Pendaftaran/kelayakan akun siswa juga **TBD**.
3. **APPROVED:** Submission MVP text-only. Attachment, upload dan Supabase Storage berada di luar scope.
4. **APPROVED:** Semua assessment wajib melalui human review sebelum finalisasi. **TBD:** siapa reviewer, bagaimana assignment dan otorisasinya, audit trail, SLA/antrian review, serta apakah feedback provisional boleh terlihat oleh siswa.
5. **TBD:** Kriteria, skala, bobot dan versi rubric; kapan hasil boleh berstatus final.
6. **TBD:** Model Groq, structured-output contract, batas konteks dan kebijakan pengiriman data siswa.
7. **TBD:** Synchronous vs background processor/queue, retry, timeout, idempotency dan operational monitoring.
8. **TBD:** Kapan dan berapa XP diberikan; goal bounds, level thresholds, streak bonus/grace dan achievement milestones.
9. **TBD:** Retention/deletion policy untuk data siswa dan output misi, serta persetujuan/privasi peserta di bawah umur.
10. **TBD setelah Supabase tersedia:** JWT signing algorithm, assignment `app_metadata.role`, DB runtime role, RLS context strategy, Hyperdrive credentials dan environment.
11. **APPROVED:** Frontend MVP memakai React + TypeScript + Vite SPA, React Router, TanStack Query, Supabase JS Auth-only, `openapi-typescript` + `openapi-fetch`, dan Cloudflare Workers Static Assets. **TBD:** pembuatan repo GitHub frontend, domain/origin, dan environment credentials.

## 10. Definition of Done untuk setiap slice

- Acceptance criteria spesifik untuk feature terpenuhi.
- Input divalidasi di boundary API dengan Zod; ownership/permission ditegakkan backend.
- Route dan request/response/error contract terdaftar pada OpenAPI.
- Unit/integration tests yang relevan lulus; perubahan perilaku mengikuti RED → GREEN → REFACTOR.
- Worker typecheck/build dan focused runtime smoke test lulus.
- Migration dapat dijalankan pada database development yang sesuai.
- Error response tidak mengekspos stack trace, SQL, token, secret atau data siswa yang tidak diperlukan.
- README/ADR/OpenAPI diperbarui bila ada keputusan atau kontrak yang berubah.
- Tidak ada commit langsung ke `main`; workflow tim mengikuti branch/PR policy pada Development Handbook.

## 11. Status pelaksanaan dan batas saat ini

- Foundation PostgreSQL/Hyperdrive, auth boundary, profile/career-goals, mission catalog, submission, dan learning progression sudah diimplementasikan pada branch/PR terpisah dan diuji secara lokal.
- Dashboard siswa mengagregasi status/riwayat source-of-truth; rekomendasi misi menggunakan overlap keyword tujuan karier dan fallback katalog published yang belum dicoba, dengan alasan transparan.
- Dashboard/recommendation implementation intentionally exposes only assessment status/finality flags; assessment scores and feedback remain in the following assessment slice after policy approval.
- Owner-scoped submission detail and assessment request/status endpoints now record queued runs only; no AI processing or finalization is implied until a processor and scoring/reviewer policy exist.
- MVP product decisions (2026-11-25): only `student` role, mandatory human review before assessment finalization, and text-only submissions. Student role is allowlisted from verified Supabase `app_metadata`; unsupported explicit roles receive 403.
- Frontend integration architecture selected in ADR 0007: React/Vite SPA on separate Cloudflare Static Assets Worker, Supabase Auth-only, TanStack Query and generated OpenAPI client; frontend repository has not yet been created.
- Mandatory review does not create a `reviewer` product role. A separate trusted reviewer identity/access path is an explicit blocker for assessment processing and finalization; queued assessment requests remain request-only until that path, rubric and processor are approved.
- Learning progression menggunakan policy provisional. XP rewards dan achievement unlock tetap nonaktif sampai product owner menyetujui nilai dan status policy.
- Dashboard/recommendations serta assessment read/status masih merupakan slice berikutnya.
- Groq feedback, reviewer finalization, remote Supabase auth/JWKS, production RLS context, Hyperdrive staging, dan deployment menunggu keputusan produk atau kredensial Supabase.
