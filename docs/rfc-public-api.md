# RFC: Public API v1, API Key, Webhook Keluar & Server MCP

Status: **diimplementasikan** (belum di-commit; migrasi `0007`–`0009` belum
di-push ke staging/produksi)
Tanggal: 26–27 Sep 2026
Prasyarat: `docs/deployment.md` §11

Fitur ini membuka Sahabat Kreator untuk integrasi eksternal — Zapier, Make,
dashboard klien, dan agen AI lewat MCP — tanpa membuka satu pun endpoint
internal. Dokumen ini mencatat keputusan desain, kontrak, dan hal-hal yang
sengaja **tidak** dibangun.

---

## 1. Ringkasan keputusan

| # | Keputusan | Alasan singkat |
|---|---|---|
| 1 | `/v1` memakai **allowlist tertutup** (salin route, bukan `app.route()` router asli) | Memasang router asli akan membuka SEMUA endpoint `/api` diam-diam |
| 2 | Key = **milik organisasi**, bukan user | Semua guard internal berbasis org; key mewakili org |
| 3 | Token disimpan **SHA-256 saja** | Plaintext hanya tampil sekali; bocor DB ≠ bocor token |
| 4 | Autentikasi lewat **header**, bukan OAuth2 | 90% kasus integrasi = server-to-server; OAuth2 belum dibutuhkan |
| 5 | Konfigurasi key & webhook **tidak ada di `/v1`** | Token tidak boleh bisa mengelola dirinya sendiri |
| 6 | Webhook keluar pakai **HMAC-SHA256 per-endpoint** | Verifikasi standar, secret bisa dirotasi tanpa ganti kode |
| 7 | Limit plan diubah dari **per-org** jadi **pool per-user** | Satu pemilik dengan 3 org bisa mengakali limit dengan cara lama |
| 8 | Kredit render ditambahkan sebagai **dimensi terpisah** dari kredit AI | Render Modal punya biaya nyata; perlu plafon sendiri |
| 9 | MCP server = **adapter tipis**, bukan layanan baru | Satu sumber kebenaran: `/v1`. Tidak ada logika bisnis kedua |
| 10 | Event `automation.triggered` **benar-benar di-emit** | Sebelumnya terdaftar & bisa dilanggan tapi tidak pernah dikirim |

---

## 2. Konteks & gap

Sebelum fitur ini:

- **Tidak ada jalur integrasi.** Semua aksi hanya bisa lewat UI; tidak ada
  cara programatik untuk klien agensi menarik laporan atau menjadwalkan post.
- **Tidak ada notifikasi keluar.** Klien harus polling UI untuk tahu post
  sudah terbit atau render sudah selesai.
- **Tidak ada agen AI.** MCP adalah cara natural memberi LLM akses terkendali
  ke data org — tanpa menyerahkan cookie session.
- **Kredit render tidak dibatasi.** Job Modal (video/carousel/auto-clip) bisa
  dienqueue tanpa plafon apa pun; hanya kredit AI yang dijaga.
- **Limit plan bisa dikelabui.** `getOrgTier` membaca subscription org aktif
  saja, jadi satu pemilik dengan beberapa org gratis mendapat limit berlipat.

Yang ditutup: jalur integrasi ber-token, notifikasi event keluar, akses agen
AI, plafon kredit render, dan konsolidasi limit ke pool per-user.

---

## 3. Arsitektur

### 3.1 Allowlist tertutup — `apps/server/src/routes/v1/mount.ts`

`mountRoutes(parent, prefix, source, specs)` **menyalin** route dari router
`/api` alih-alih memasangnya ulang:

- Middleware modul (entri `method: "*"` dari `source.use(...)`, mis.
  `gateFeature("automation")` atau `aiRateLimit`) **ikut disalin** — tanpa ini,
  gate paket yang melindungi modul tersebut hilang di `/v1`.
- Handler disalin **hanya** bila `(method, path)` ada di `specs`.
- Bila ada entri `specs` yang tidak ketemu di router sumber, fungsi **throw**
  saat boot (`allowlist tidak cocok untuk "<prefix>"`) — jadi rename route di
  `/api` tidak bisa diam-diam mematikan endpoint `/v1`; gagal saat start,
  bukan saat request.

Konsekuensi: satu-satunya sumber implementasi tetap handler `/api`. Tidak ada
query yang diduplikasi, dan tidak ada endpoint yang bocor karena lupa
mendaftarkan pengecualian.

### 3.2 Rantai middleware `/v1` — `apps/server/src/lib/public-api.ts`

```
verifyApiKeyMiddleware   401  token tidak ada / tidak valid / dicabut / kedaluwarsa
publicApiRateLimit       429  60 permintaan / 60 detik PER KEY (bukan per IP)
publicApiPlanGate        402  api_access (semua method) + api_write (method tulis)
requireScope(...)        403  scope spesifik per route
```

Dua catatan desain:

- **Rate limit memakai key ID sebagai identitas**, bukan IP. Klien eksternal
  berbagi IP egress (Zapier, serverless) — limit per IP akan saling menimpa
  antar pelanggan. `rateLimitMiddleware` menerima opsi `identity?: (c) => string`
  baru untuk ini.
- **Dokumentasi didaftarkan sebelum `use("*")`.** `/v1/openapi.json` dan
  `/v1/docs` (Scalar API Reference) dipasang lebih dulu sehingga bisa dibuka
  tanpa key; di Hono, handler yang terdaftar lebih dulu memenangkan rantai dan
  middleware sesudahnya tidak dijalankan.

Catch-all 404 (`v1Route.all("/*")`) sengaja diletakkan **di belakang** auth:
request tanpa key ke path salah tetap menerima **401**, bukan 404 — supaya
keberadaan endpoint tidak bisa dipetakan tanpa token.

### 3.3 Guard lama dipakai ulang — `apps/server/src/lib/auth-guard.ts`

`verifyApiKey` mengembalikan bentuk yang identik dengan `AuthContext`, lalu
middleware menyimpannya di `c.set("apiKeyAuth", ...)`. `getAuthContext()`
membacanya **paling atas**, sebelum lookup session cookie:

```ts
const apiKeyAuth = c.get("apiKeyAuth");
if (apiKeyAuth) return apiKeyAuth;      // request /v1 tidak pernah cari cookie
```

Hasilnya `requireOrg`, `requirePermission`, `requireOrgAdmin` dan seluruh
handler `/api` bekerja tanpa satu baris pun diubah.

---

## 4. Model API key

### 4.1 Format & penyimpanan — `apps/server/src/lib/api-key.ts`

| Aspek | Nilai |
|---|---|
| Format | `sk_live_` + 32 karakter base64url (dari 24 byte acak) |
| Disimpan | `token_hash` = SHA-256 hex (unik global) |
| Ditampilkan | `token_prefix` = 12 karakter pertama, mis. `sk_live_ab12` |
| Plaintext | Hanya pada respons create & rotate. Tidak pernah disimpan |
| Perbandingan | `timingSafeEqual` atas buffer hex |

Pola ini sama dengan `report_share.token` (link sekali-lihat). SHA-256 tanpa
salt cukup di sini karena token punya entropi 192 bit — tidak bisa di-brute
force seperti password.

### 4.2 Resolusi konteks — `verifyApiKey`

Urutan penolakan (semua → `null` → 401):

1. Prefix bukan `sk_live_`.
2. Hash tidak ketemu di DB.
3. `revokedAt` terisi.
4. `expiresAt` sudah lewat.
5. Pembuat (`created_by`) sudah dihapus atau `banned`.
6. Pembuat **sudah bukan anggota org** key tersebut.

Poin 6 di-resolve **live** dari tabel `member` pada tiap request — jadi
mengeluarkan seseorang dari organisasi otomatis mematikan key yang ia buat,
tanpa perlu job pembersih.

Error DB **dipropagasi**, bukan diubah jadi `null`, supaya gangguan database
tidak menyamar sebagai 401 (yang akan menyesatkan klien jadi mengira tokennya
salah).

`lastUsedAt` ditulis **fire-and-forget** dan hanya bila update terakhir > 60
detik lalu — mencegah satu `UPDATE` per request.

### 4.3 Scope — `packages/db/src/schema/api-key.ts`

15 scope, pola `<resource>:<read|write>`:

```
accounts:read            media:read      renders:read     webhooks:read
analytics:read           media:write     renders:write    webhooks:write
ai:read                  posts:read      reports:read
ai:write                 posts:write     automation:read
automation:write
```

`webhooks:write` sudah dideklarasikan tapi **belum ada route yang memakainya**
(lihat §13). Key wajib punya ≥1 scope saat dibuat.

Satu keputusan yang perlu dicatat: **polling status render memakai
`renders:write`**, bukan `renders:read`. Alasannya polling adalah bagian tak
terpisahkan dari alur tulis (buat job → poll sampai selesai); scope tulis tidak
pernah dimiliki key read-only, jadi tidak ada konfigurasi key yang jadi
setengah jalan. Ini disengaja, bukan kelalaian.

### 4.4 Siklus hidup — `apps/server/src/routes/api-keys.ts`

| Aksi | Endpoint | Catatan |
|---|---|---|
| List | `GET /api/api-keys` | Tanpa `tokenHash` |
| Create | `POST /api/api-keys` | Plaintext dikembalikan **sekali** (201) |
| Rotate | `POST /api/api-keys/:id/rotate` | Token lama langsung mati |
| Revoke | `DELETE /api/api-keys/:id` | Soft delete (`revokedAt`), audit tetap ada |

- Semua endpoint **session-only** (`requireOrgAdmin`) — token tidak boleh
  mengelola token.
- **Maksimal 10 key aktif** per org (dicabut/kedaluwarsa tidak dihitung).
- Pembuatan & rotasi ikut digerbangi `api_access`, jadi org Free dapat **402**
  plus ajakan upgrade — bukan pesan error mentah.

---

## 5. Skema DB & migrasi

| Migrasi | Isi | Untuk |
|---|---|---|
| `0007_render_credits.sql` | tabel `render_usage`, kolom `plan.render_credits_per_month` | plafon kredit render |
| `0008_slow_squadron_supreme.sql` | tabel `api_key` | Public API |
| `0009_military_colossus.sql` | tabel `webhook_endpoint`, `webhook_delivery` | webhook keluar |

`render_usage` adalah mirror `ai_usage`: unik per `(organization_id, period)`,
`period` format `YYYY-MM`. Konsumsi **dicatat per-org aktif** (atribusi audit)
tapi **dicek agregat pool** (§8).

`webhook_delivery` punya unique index `(endpoint_id, event, payload)` — inilah
mekanisme dedup, bukan pengecekan di aplikasi (§6.4).

> **Status:** ketiga migrasi belum di-push. Jalankan `bun run db:push` /
> `db:migrate` di staging dulu, verifikasi tabel ada, baru produksi. Lihat
> `docs/deployment.md` §11.

---

## 6. Webhook keluar

### 6.1 Event — `packages/db/src/schema/webhook.ts`

```ts
WEBHOOK_EVENTS = [
  "post.published", "post.failed", "post.scheduled",
  "render.completed", "render.failed",
  "media.imported", "automation.triggered",
]
```

Daftar ini adalah **kontrak publik**. Menambah event = mengubah schema +
menambah emission point; jangan pakai string bebas.

Titik emisi yang terpasang:

| Event | Emisi |
|---|---|
| `post.published` / `post.scheduled` | `apps/server/src/routes/posts.ts` |
| `post.published` / `post.failed` | `packages/queue/src/processor.ts` (`emitPostEvent`) |
| `render.completed` / `render.failed` | `render-processor.ts`, `carousel-processor.ts`, `auto-clip-processor.ts` |
| `media.imported` | `apps/server/src/routes/media.ts` |
| `automation.triggered` | `packages/publishing/src/automation.ts` (via hook, §6.6) |

### 6.2 Signing — `packages/queue/src/sign.ts`

```
POST <url>
content-type: application/json
x-sk-event: post.published
x-sk-signature: v1=<hex HMAC-SHA256(body, secret)>
x-sk-delivery: sk_whdel_<32 hex>

{ "event": "...", "deliveredAt": "ISO-8601", "data": { ... } }
```

Secret HMAC disimpan **terenkripsi** (`webhook_endpoint.secret_enc`,
`ENCRYPTION_KEY`) — didekripsi hanya saat menandatangani. Karena secret
dipakai untuk signing (bukan lookup), ia tidak pernah perlu di-decrypt di sisi
klien, dan **tidak pernah dikembalikan API** (`stripSecret`).

Header signature berversi (`v1=`) supaya skema signing bisa berubah tanpa
mematahkan klien lama. Verifikasi klien **wajib** `timingSafeEqual`; contoh
kode ada di dokumen API.

### 6.3 Pengiriman & retry — `packages/queue/src/webhook-delivery.ts`

| Aspek | Nilai |
|---|---|
| Transport | BullMQ queue `sk_webhook_delivery` |
| Fallback | polling DB tiap 30 detik bila `REDIS_URL` kosong |
| Concurrency | 10 (HTTP ringan) |
| Attempts | 5, exponential dari 30 detik (30s → 2m → 8m → 30m → 2j) |
| Timeout | 15 detik per pengiriman (`AbortSignal.timeout`) |
| Status | `queued` → `delivered` / `retrying` → `failed` |
| Retensi job | sukses 24 jam / 1.000 job, gagal 7 hari |

Respons non-2xx **di-throw** supaya BullMQ meretry; `response_body` disimpan
terpotong 500 karakter sebagai bahan diagnosis tanpa menyimpan blob.

Endpoint yang sudah di-revoke / nonaktif → langsung `failed`, **tanpa retry**
(retry tidak akan pernah berhasil).

### 6.4 Idempotensi

Dedup ditegakkan di **database**, bukan di aplikasi: `uniqueIndex(endpoint_id,
event, payload)`. `emitWebhookEvent` menyisipkan baris `webhook_delivery`
lalu meng-enqueue; pelanggaran unique = duplikat → di-skip dalam blok
`try/catch`. Ini membuat emit aman dipanggil dari webhook platform maupun
polling sekaligus (pola yang sama dengan dedup `automation_log`).

Efek samping yang menguntungkan: payload identik tidak dikirim dua kali, jadi
consumer boleh menganggap delivery idempoten per (endpoint, event, payload).

### 6.5 SSRF — `apps/server/src/lib/ssrf.ts`

URL webhook adalah input pengguna dan akan di-fetch oleh server, jadi wajib
divalidasi saat create **dan** update:

- Hanya skema `http`/`https`.
- Hostname di-resolve DNS (`all: true`) dan **setiap** A/AAAA record diperiksa
  — satu saja yang private → tolak.
- Rentang ditolak: `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`,
  `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`, dan IPv4-mapped `::ffff:a.b.c.d`
  (IPv4 yang tertanam ikut divalidasi).

Pelanggaran → `UnsafeUrlError` → **400** dengan pesan Bahasa Indonesia.

### 6.6 `automation.triggered` — hook, bukan import langsung

`packages/publishing` **tidak boleh** import `@sahabatkreator/queue` (arah
dependency satu arah; import balik = cycle). Tapi `processAutomation` perlu
meng-emit event. Solusinya pola hook yang sudah dipakai untuk enqueue
auto-reply:

- `packages/publishing/src/event-hook.ts` — `registerWebhookEmit(fn)` /
  `emitWebhook(...)`, default **no-op** bila belum terdaftar.
- `apps/server/src/index.ts` & `apps/worker/src/index.ts` memanggil
  `registerWebhookEmit(emitWebhookEvent)` saat boot.

Emit diletakkan **setelah** insert `automation_log` yang unik berhasil — jadi
dedup log otomatis juga men-dedup notifikasinya.

> Catatan: sebelum perbaikan ini, `automation.triggered` terdaftar di
> `WEBHOOK_EVENTS`, muncul di UI Settings → Webhook dan di
> `GET /v1/webhooks/events`, tapi **tidak pernah dikirim** — kontrak publik
> yang bohong.

---

## 7. Server MCP — dua transport

Tool MCP adalah proyeksi dari `/v1`. Tabelnya hidup di satu tempat —
`packages/api/src/mcp/tools.ts` (`MCP_TOOLS`) — supaya kedua transport tidak
pernah berbeda diam-diam dari allowlist `/v1`.

| Transport | Lokasi | Dipakai oleh | Auth |
|---|---|---|---|
| stdio | `apps/mcp` | pemilik repo (butuh Bun + repo lokal) | `SAHABATKREATOR_API_KEY` |
| Streamable HTTP | `POST /mcp` (`apps/server`) | pelanggan, tanpa instalasi | `Authorization: Bearer <api key>` |

### 7.1 stdio — `apps/mcp`

```bash
SAHABATKREATOR_API_KEY=sk_live_... bun run start   # atau: bun run start sk_live_...
```

- `SERVER_URL` (default `http://localhost:3000`) menentukan basis API.
- Saat boot, MCP memanggil `GET /v1/ping` sekali untuk membaca **scope token**.
- Tool berscope hanya didaftarkan bila token punya scope itu — token
  read-only tidak akan pernah melihat tool tulis. Prinsipnya: **tool MCP
  mengikuti scope token**, bukan sebaliknya.

### 7.2 Streamable HTTP — `apps/server/src/routes/mcp.ts`

Stateless dan menjawab JSON, bukan SSE:

- **Stateless** (`sessionIdGenerator: undefined`) karena tool di sini murni
  proxy tanpa state percakapan → tidak butuh session store, tidak butuh sticky
  session di belakang NGINX, container bisa di-scale bebas.
- **JSON, bukan SSE** karena NGINX `proxy_buffering` (default on) menyangga
  respons streaming; JSON menghapus kebutuhan `proxy_buffering off`.
- `GET`/`DELETE` ditolak **405**: tidak ada pesan server→klien untuk di-stream
  dan tidak ada sesi untuk ditutup, jadi stream yang terbuka hanya menahan
  koneksi sampai timeout.
- Rantai middleware: `verifyApiKey` → parse JSON-RPC → limiter envelope →
  `publicApiAccessGate` → transport.

**Kenapa `publicApiAccessGate`, bukan `publicApiPlanGate`.** MCP menyalurkan
semua tool lewat satu method HTTP (POST), jadi gate berbasis method akan
menuntut `api_write` (Business+) bahkan untuk tool baca. Gate tulis yang benar
dipasang oleh subrequest internal ke `/v1/<path>` — di sana method aslinya
sudah dipulihkan.

**Subrequest internal, bukan handler kedua.** Setiap `tools/call` memetakan
tool → `(method, path, query/body)` lalu mengirim `Request` ke `app.fetch()`
yang sama. Konsekuensi yang disengaja: seluruh middleware `/v1` (scope, gate
`api_write`, kuota, konsumsi kredit AI, audit) berjalan apa adanya, dan
pencabutan key tetap berlaku seketika karena token diverifikasi ulang — tidak
ada cache verifikasi yang bisa basi. Harganya: `verifyApiKey` berjalan dua kali
per tool call (§11).

### 7.3 Anotasi tool

Setiap tool membawa `title` dan anotasi MCP (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`). Klien memakainya untuk memutuskan apakah
sebuah tool boleh dipanggil tanpa konfirmasi pengguna, dan direktori Connector
Claude mensyaratkannya ada — tool tanpa anotasi gagal review.

Anotasi **diturunkan, bukan ditulis manual**: `toolAnnotations()` di
`packages/api/src/mcp/tools.ts` menghitungnya dari `scope` + `method`, sehingga
anotasi tidak pernah berbeda dari perilaku tool yang sebenarnya. Katalog saat
ini: 12 tool baca (`readOnlyHint` + `idempotentHint`), 2 tool tulis
(`ai_caption`, `ai_hashtag` — keduanya generator, jadi tidak destruktif), dan 3
tool `openWorldHint` (kedua generator AI + `trends`, yang datanya diambil dari
Google Trends). Menambahkan tool `DELETE`/`PATCH` otomatis menandainya
destruktif.

### 7.4 Rate limit

| Permukaan | Batas | Ditagih oleh |
|---|---|---|
| handshake (`initialize`, `tools/list`, `notifications/*`) | 120 / menit per key | limiter envelope `/mcp` |
| `tools/call` | 60 / menit per key | kuota `/v1` — satu tool call = satu request `/v1` |

`tools/call` **sengaja dilewatkan** limiter envelope: pekerjaannya sudah
ditagih kuota `/v1` lewat subrequest, jadi menghitungnya dua kali akan membuat
batas efektif jadi separuh dari yang dijanjikan dokumentasi. 429 dari limiter
envelope dibentuk sebagai JSON-RPC (`-32000`), bukan `{message}` seperti REST,
supaya klien MCP bisa mem-parse kegagalannya.

### 7.5 Yang belum ada

- **Connect akun sosial via API** (bridge gaya Repliz) — rancangan terpisah di
  `docs/rfc-oauth-connect.md`. Sengaja **tidak** memakai OAuth 2.1: developer memakai API key
  + scope `accounts:write`, sama seperti Repliz memakai Basic Auth.
- **OAuth 2.1** (§13). Klien yang bisa mengirim header sendiri (Claude Code,
  Cursor, Windsurf, Claude Desktop config, ChatGPT Responses API) cukup dengan
  bearer API key. Yang menuntut OAuth adalah permukaan directory/UI: ChatGPT
  Connectors dan claude.ai web connector.
- **Resumability SSE dan pesan server→klien** (sampling/elicitation) — tidak
  dipakai; lihat alasan stateless di 7.2.
- **Distribusi npm/npx** untuk transport stdio (§14).

Tidak ada logika bisnis di MCP — hanya pemetaan nama tool → method + path +
scope. Konsumsi kredit tetap terjadi di server (handler `/api` yang sama), jadi
pemakaian lewat MCP tercatat identik dengan pemakaian lewat UI.

---

## 8. Pool quota per-user & kredit render — `packages/db/src/pool-quota.ts`

Modul ini diletakkan di `packages/db` (bukan `apps/server`) karena dipakai
tiga konsumen: server (HTTPError), worker (tanpa HTTP), dan `packages/auth`
(hook undangan). Ia **throw error polos**; caller server yang membungkus jadi
HTTP 402 lewat `rethrowQuotaAsHttp`.

### 8.1 Pool

```
resolvePoolOrgIds(orgAktif)
  → pemilik org aktif (member role='owner', terlama dulu)
  → semua org yang dimiliki user itu (role='owner')
  → fallback [orgAktif] bila pemilik tak ditemukan
```

**Tier pool** = tier tertinggi di antara semua org pool
(`free < pro < business < enterprise`), hanya langganan `active` dan belum
lewat `currentPeriodEnd`.

**Pemakaian dijumlahkan lintas pool**: akun sosial, post bulan ini, anggota
tim (distinct `userId` — satu orang di 2 org tidak dihitung dua kali),
storage, kredit AI (SUM), kredit render (SUM).

Konsumsi kredit tetap **dicatat di org aktif** (atribusi per-org untuk audit),
tapi **dicek terhadap SUM pool**.

### 8.2 Kredit render

`RENDER_CREDIT_COST` (`apps/server/src/lib/billing.ts`):

| Aksi | Kredit |
|---|---|
| `video` | 10 |
| `carousel` | 5 |
| `autoClipAnalysis` | 5 |
| `autoClipSegment` | 5 / klip |

Charge dilakukan **saat enqueue**, bukan saat sukses. Gagal render **tidak
di-refund**; retry eksplisit gratis (endpoint retry tidak men-charge ulang;
auto-clip `:id/select` hanya men-charge segmen berstatus `pending`).

Perilaku worker saat kredit habis:

- **Carousel** — layout-director jatuh ke template fallback; job tetap jalan.
- **Auto-clip** — gagal non-retryable `ai_quota_exceeded`; user harus upgrade
  atau menunggu reset.

---

## 9. Perubahan di `packages/auth`

Dua gate baru, keduanya di `before` hook better-auth:

### 9.1 Gate anggota tim

`assertTeamMemberQuota(organizationId)` dipanggil di
`beforeCreateInvitation` **dan** `beforeAcceptInvitation` — dicek dua kali
karena undangan bisa dibuat saat masih ada slot, lalu diterima setelah slot
penuh. Limit = anggota **distinct** lintas seluruh org pool. Error:
`ORGANIZATION_MEMBERSHIP_LIMIT_REACHED` (403).

### 9.2 Gate registrasi terbuka

`user.create.before` menolak `signUp` bila `platformSettings.registrationEnabled`
false, dengan error `REGISTRATION_DISABLED`. **User pertama selalu
diizinkan** supaya bootstrap instalasi baru tidak terkunci sebelum ada admin
yang bisa membuka kembali.

---

## 10. OpenAPI & dokumentasi interaktif

- Dokumen dibangun di `packages/api/src/public-api/` dari registry
  zod-to-openapi; **path ditulis manual** karena handler `/v1` adalah route
  `/api` yang di-mount ulang — dokumen ini mendeskripsikannya, bukan
  men-generate routenya.
- Spec kanonik: `packages/api/scripts/public-api.json` (30 path, 64 schema).
  Regenerate: `bun run --filter @sahabatkreator/api openapi:gen`.
- **Drift dicegah CI/test**: `openapi:verify` membandingkan spec yang
  di-commit dengan hasil generate ulang, dan gagal bila berbeda. Jalankan
  setiap kali skema/path `/v1` berubah.
- Runtime: `GET /v1/openapi.json` (tanpa auth) dan `GET /v1/docs` (Scalar).

---

## 11. Biaya

Fitur ini **tidak menambah biaya infrastruktur baru**: tidak ada Modal app
ke-4, tidak ada layanan eksternal. Yang bertambah hanya:

| Komponen | Beban |
|---|---|
| Webhook delivery | 1 request HTTP keluar per event per endpoint (~15s timeout) |
| API key verification | 3–4 query DB per request `/v1` (key, user, member, org) |
| Rate limit | 1 operasi Redis (atau in-memory) per request |
| MCP (stdio, `apps/mcp`) | 0 di server — berjalan di mesin pengguna |
| MCP (HTTP, `POST /mcp`) | 0 layanan baru. Per tool call: 1 request `/v1` internal + `verifyApiKey` **dua kali** (envelope + subrequest) |

Dua kali verifikasi pada `POST /mcp` adalah pertukaran yang disengaja: menjamin
pencabutan key langsung berlaku tanpa cache yang bisa basi. Bila nanti jadi
beban nyata (volume agen tinggi), yang benar adalah membuat jalur verifikasi
bertanda-tangan untuk subrequest internal — **bukan** menambah TTL cache pada
`verifyApiKey`, karena itu melanggar jaminan "key mati saat pembuatnya keluar
dari org".

Yang perlu diperhatikan: **`lastUsedAt`** ditulis fire-and-forget (dibatasi
60 detik) dan rate limit `/v1` memakai bucket Redis terpisah dari `/api`.

Plafon kredit render (§8.2) justru **mengurangi** risiko biaya tak terduga:
sebelumnya job Modal bisa dienqueue tanpa batas.

---

## 12. Fase implementasi

| Fase | Isi | Status |
|---|---|---|
| 0 | Skema DB (`api_key`, `webhook_*`, `render_usage`) + migrasi 0007–0009 | selesai (belum di-push) |
| 1 | Public API read: accounts, posts, analytics, reports, media, renders | selesai |
| 2 | Automation read/write | selesai |
| 3 | Render async (carousel/video/auto-clip) + AI (caption/hashtag/rewrite/repurpose/trends) | selesai |
| 4 | Webhook keluar: endpoint CRUD, delivery log, 7 event | selesai |
| 5 | MCP server (stdio) | selesai |
| 6 | Pool quota per-user + kredit render + gate registrasi/tim | selesai |
| 7 | Push migrasi ke staging → smoke test → produksi | **belum** |

---

## 13. Yang sengaja tidak dibangun

- **OAuth2 / authorization code flow.** Hanya bearer token. Belum ada kasus
  yang butuh klien bertindak atas nama pengguna akhir pihak ketiga.
- **API key per-user.** Key mewakili organisasi; semua guard internal berbasis
  org. Key per-user akan butuh model izin kedua.
- **Konfigurasi key & webhook lewat `/v1`.** Disengaja: token tidak boleh bisa
  membuat/mencabut token atau mengubah tujuan webhook-nya sendiri.
- **White-label OAuth redirect.** `api_webhook` sempat dipromosikan sebagai
  "Webhook & white-label" — tapi redirect URI **per-org belum ada**.
  `redirectUri` yang ada di kredensial platform adalah milik *app* (diatur
  admin di `/admin/credentials`), bukan redirect kustom per-organisasi. Label
  di `feature-catalog.ts` dan komentar `API_FEATURES.webhook` sudah dikoreksi
  jadi "Webhook keluar" saja supaya tidak menjanjikan fitur yang tidak ada.
- **Scope `webhooks:write`.** Sudah dideklarasikan tapi belum ada route — hanya
  `webhooks:read` (delivery log & daftar event) yang diekspos.
- **Idempotency key untuk request tulis.** POST `/v1/posts` yang di-retry bisa
  membuat dua post. Belum ada header `Idempotency-Key`.
- **Pagination berbasis cursor.** Masih `page`/`perPage`.
- **IP allowlist per key.**
- **OAuth 2.1 untuk MCP.** Transport HTTP sudah ada (§7.2), tapi hanya bearer
  API key. Klien yang menuntut OAuth (ChatGPT Connectors, claude.ai web
  connector) belum bisa dipakai — butuh discovery, DCR/CIMD, dan PKCE S256.
- **Rate limit bertingkat per paket.** Semua key dapat 60 req/menit — termasuk
  MCP. Untuk agen AI ini ketat: satu turn percakapan bisa memanggil belasan
  tool, jadi pengguna Business akan lebih dulu kena 429 daripada memakai
  paketnya. Kandidat kuat untuk dikerjakan bersama §7.3.
- **Retensi `webhook_delivery`.** Belum ada job pembersih; tabel akan tumbuh.
- **Notifikasi kedaluwarsa key.** Key bisa expired diam-diam; tidak ada email
  pengingat.

---

## 14. Keputusan tertunda

1. **Penagihan pemakaian API.** Belum ditagih terpisah dari paket; semua
   masuk fitur `api_access`/`api_write`/`api_webhook`. Bila nanti ditagih,
   `api_key` sudah punya `lastUsedAt` sebagai basis.
2. **Event tambahan.** Kandidat kuat: `dm.received`, `engagement.created`,
   `post.updated`. Tambah hanya bila ada konsumen nyata.
3. **`webhooks:write`.** Dipakai atau dihapus — jangan dibiarkan menggantung.
4. **Retensi & pembersihan `webhook_delivery`** (mis. hapus > 30 hari).
5. **Rotasi secret tanpa downtime.** Sekarang PATCH secret langsung berlaku;
   idealnya ada jendela dual-signing.
6. **`Idempotency-Key`** untuk endpoint tulis — penting begitu ada klien
   produksi yang retry otomatis.
7. **Distribusi MCP stdio** (npm package / `npx`) supaya pengguna tidak perlu
   clone repo. Transport HTTP (§7.2) sudah menutup kasus "pelanggan tanpa
   instalasi"; yang tersisa adalah kenyamanan untuk pengguna stdio.
8. **Rate limit bertingkat per paket** (§13) — prasyarat sebelum mempromosikan
   MCP ke pengguna Business/Enterprise, karena 60 req/menit per key terlalu
   ketat untuk agen.
9. **OAuth 2.1 untuk `/mcp`** (§13) — hanya perlu bila mau masuk directory
   MCP atau ChatGPT/claude.ai lewat UI.
10. **White-label OAuth redirect per-organisasi.** Bila dibutuhkan, key
   `api_webhook` sudah jadi tempat yang tepat untuk menggerbangi — jangan
   tambah key katalog baru.

---

## 15. Referensi file

| Area | File |
|---|---|
| Allowlist & router | `apps/server/src/routes/v1/{index,mount,webhooks}.ts` |
| Middleware & gate | `apps/server/src/lib/public-api.ts`, `feature-gate.ts` |
| Token | `apps/server/src/lib/api-key.ts`, `routes/api-keys.ts` |
| Webhook config | `apps/server/src/routes/webhook-endpoints.ts` |
| Webhook kirim | `packages/queue/src/{sign,webhook-emit,webhook-delivery}.ts` |
| Hook publishing | `packages/publishing/src/event-hook.ts` |
| Pool quota | `packages/db/src/pool-quota.ts` |
| Skema | `packages/db/src/schema/{api-key,webhook,billing}.ts` |
| Migrasi | `packages/db/src/migrations/000{7,8,9}_*.sql` |
| MCP — tabel tool bersama | `packages/api/src/mcp/tools.ts` |
| MCP — stdio | `apps/mcp/src/index.ts` |
| MCP — HTTP (`POST /mcp`) | `apps/server/src/routes/mcp.ts` |
| OpenAPI | `packages/api/src/public-api/`, `scripts/public-api.json` |
| UI | `apps/web/src/components/settings/{api-key,webhook}-settings.tsx` |
| Harga & fitur | `apps/web/src/lib/feature-catalog.ts` (key), `packages/db/scripts/seed.ts` (paket) |
| Panduan klien MCP | `apps/mcp/README.md`, `docs/mcp-remote.md` |
