# Public API v1 — Panduan Cepat

API publik untuk integrasi eksternal: Zapier, Make, dashboard klien, server
sendiri, dan agen AI. Agen AI bisa lewat MCP — dua jalur:

- **[MCP remote](mcp-remote.md)** (`POST /mcp`) — tanpa instalasi apa pun,
  cocok untuk Claude Code, Cursor, ChatGPT Responses API.
- **[MCP stdio](../apps/mcp/README.md)** — dijalankan di mesin pengguna.

- **Referensi interaktif**: `https://sahabatkreator.com/v1/docs` (Scalar)
- **Spec OpenAPI 3.1**: `https://sahabatkreator.com/v1/openapi.json`
  (keduanya terbuka tanpa token)
- **Desain & keputusan**: [rfc-public-api.md](rfc-public-api.md)

---

## 1. Autentikasi

Buat token di aplikasi: **Settings → API → Buat key**. Token hanya ditampilkan
**sekali**; server menyimpan SHA-256-nya saja, jadi token yang hilang tidak
bisa dipulihkan — harus di-rotate.

Kirim lewat salah satu header:

```bash
curl -H "Authorization: Bearer sk_live_..." \
     https://sahabatkreator.com/v1/ping

# alternatif
curl -H "X-API-Key: sk_live_..." \
     https://sahabatkreator.com/v1/ping
```

> ⚠️ Jangan pernah menulis token asli ke file di repo. Prefix `sk_live_`
> **sama dengan format Stripe live secret key**, jadi GitHub secret scanning
> akan menandainya sebagai "Stripe API Key" dan **menolak push**. Selalu
> tulis sebagai `sk_live_...` atau ambil dari env (`$SK_API_KEY`).

`GET /v1/ping` adalah cara tercepat membuktikan token valid sekaligus melihat
scope dan organisasi yang terikat:

```json
{
  "ok": true,
  "organization": { "id": "org_...", "name": "...", "slug": "..." },
  "key": { "id": "apikey_...", "name": "Zapier", "prefix": "sk_live_ab12",
           "scopes": ["posts:read", "analytics:read"] },
  "serverTime": "2026-09-27T03:00:00.000Z"
}
```

**Key terikat ke organisasi, bukan user.** Key mewakili org tempat ia dibuat.
Kalau pembuat key dikeluarkan dari org, key **langsung mati** (role di-resolve
live setiap request) — tidak perlu mencabut manual.

---

## 2. Rate limit & batas

| Batas | Nilai |
|---|---|
| Rate limit | **60 permintaan / menit per key** (bukan per IP) |
| Key aktif per organisasi | 10 (yang dicabut/kedaluwarsa tidak dihitung) |
| Masa berlaku key | opsional, 1–3.650 hari saat dibuat |

Header `Retry-After` dikirim bersama respons **429**.

---

## 3. Scope

Scope diberikan **saat membuat key** dan tidak bisa diubah setelahnya (buat key
baru bila perlu). Pola: `<resource>:<read|write>`.

| Resource | Scope |
|---|---|
| `accounts` | `accounts:read` |
| `posts` | `posts:read`, `posts:write` |
| `analytics` | `analytics:read` |
| `reports` | `reports:read` |
| `media` | `media:read`, `media:write` |
| `renders` | `renders:read`, `renders:write` |
| `automation` | `automation:read`, `automation:write` |
| `ai` | `ai:read`, `ai:write` |
| `webhooks` | `webhooks:read` |

Scope hanya membatasi **key**. Di atasnya masih ada gate plan: `api_access`
(Pro+) untuk semua endpoint, `api_write` (Bisnis+) untuk method tulis.

---

## 4. Kode error

| Status | Arti | Yang harus dilakukan |
|---|---|---|
| `401` | Token tidak ada / tidak valid / dicabut / kedaluwarsa | Cek header, buat key baru |
| `402` | Plan tidak punya `api_access` (atau `api_write` untuk tulis) | Upgrade paket |
| `403` | Key tidak punya scope endpoint tersebut | Buat key dengan scope itu |
| `404` | Resource tidak ada **atau** bukan milik org Anda | — |
| `429` | Lewat rate limit | Tunggu `Retry-After` detik |
| `400` | Body/parameter tidak valid | Cek pesan `message` |

Semua error memakai bentuk `{ "message": "..." }` dengan pesan Bahasa
Indonesia yang siap ditampilkan.

---

## 5. Daftar endpoint

### System
| Method | Path | Scope |
|---|---|---|
| GET | `/v1/ping` | — |

### Accounts
| GET | `/v1/accounts` | `accounts:read` |
| GET | `/v1/accounts/{id}/statistic` | `accounts:read` |

### Posts
| GET | `/v1/posts` | `posts:read` |
| GET | `/v1/posts/{id}` | `posts:read` |
| POST | `/v1/posts` | `posts:write` |
| POST | `/v1/posts/{id}/publish` | `posts:write` |
| POST | `/v1/posts/{id}/retry` | `posts:write` |
| DELETE | `/v1/posts/{id}` | `posts:write` |

### Analytics & Reports
| GET | `/v1/analytics/overview` | `analytics:read` |
| GET | `/v1/analytics/timeseries` | `analytics:read` |
| GET | `/v1/analytics/top-posts` | `analytics:read` |
| GET | `/v1/reports/summary` | `reports:read` |

### Media & Renders
| GET | `/v1/media` | `media:read` |
| POST | `/v1/media/import` | `media:write` |
| GET | `/v1/renders/manifest` | `renders:read` |

### Render async (carousel / video / auto-clip)
| POST | `/v1/carousel` | `renders:write` |
| GET | `/v1/carousel/{id}` | `renders:write` |
| POST | `/v1/video` | `renders:write` |
| GET | `/v1/video/{id}` | `renders:write` |
| POST | `/v1/auto-clip` | `renders:write` |
| GET | `/v1/auto-clip/{id}` | `renders:write` |
| POST | `/v1/auto-clip/{id}/select` | `renders:write` |

> **Kenapa polling pakai `renders:write`?** Polling adalah bagian tak
> terpisahkan dari alur tulis (buat job → poll sampai selesai). Scope tulis
> tidak pernah dimiliki key read-only, jadi tidak ada konfigurasi key yang
> jadi setengah jalan. Ini disengaja.

### Automation
| GET | `/v1/automation` | `automation:read` |
| POST | `/v1/automation` | `automation:write` |
| PATCH | `/v1/automation/{id}` | `automation:write` |
| DELETE | `/v1/automation/{id}` | `automation:write` |

### AI & Trends
| GET | `/v1/ai/usage` | `ai:read` |
| POST | `/v1/ai/caption` | `ai:write` |
| POST | `/v1/ai/hashtag` | `ai:write` |
| POST | `/v1/ai/rewrite` | `ai:write` |
| POST | `/v1/ai/repurpose` | `ai:write` |
| GET | `/v1/trends` | `ai:read` |
| POST | `/v1/trends/ideas` | `ai:write` |

### Webhook (read-only)
| GET | `/v1/webhooks/deliveries` | `webhooks:read` |
| GET | `/v1/webhooks/events` | `webhooks:read` |

Konfigurasi endpoint webhook **tidak** tersedia lewat `/v1` — hanya via UI
**Settings → Webhook**, supaya token tidak bisa mengubah tujuannya sendiri.

---

## 6. Contoh

### Jadwalkan post

```bash
curl -X POST https://sahabatkreator.com/v1/posts \
  -H "Authorization: Bearer $SK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Promo akhir bulan! Diskon 30% untuk semua paket.",
    "platforms": ["instagram", "facebook"],
    "scheduledAt": "2026-10-01T09:00:00+07:00"
  }'
```

### Buat carousel, lalu poll status

```bash
JOB=$(curl -s -X POST https://sahabatkreator.com/v1/carousel \
  -H "Authorization: Bearer $SK_TOKEN" -H "Content-Type: application/json" \
  -d '{"topic":"Tips produktivitas konten","slides":5}' | jq -r '.id')

# Poll sampai status != queued/rendering
curl -s -H "Authorization: Bearer $SK_TOKEN" \
  https://sahabatkreator.com/v1/carousel/$JOB | jq '.status'
```

### Generate caption (mengonsumsi kredit AI)

```bash
curl -X POST https://sahabatkreator.com/v1/ai/caption \
  -H "Authorization: Bearer $SK_TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"kopi arabika lokal","platform":"instagram","tone":"santai"}'
```

### Kirim data ke Google Sheets (langkah Zapier/Make)

1. Trigger: **Webhook → Catch Hook**, salin URL-nya.
2. Di Sahabat Kreator: **Settings → Webhook → Buat endpoint**, tempel URL,
   pilih event `post.published`, isi secret ≥16 karakter.
3. Aksi: petakan `data.postGroupId`, `data.platform`, `data.url` ke kolom.

---

## 7. Konsumsi kredit

Aksi generatif memotong kredit **pool** organisasi (limit diagregasi lintas
semua org yang dimiliki pemiliknya), dengan tarif identik dengan pemakaian
lewat UI. Ringkasnya:

| Aksi | Kredit |
|---|---|
| `ai/caption`, `ai/hashtag`, `ai/rewrite`, `ai/repurpose` | 1 (AI) |
| `trends/ideas` | 3 (AI) |
| `carousel` | 5 (render) |
| `video` | 10 (render) |
| `auto-clip` | 5 (render) + 5 per klip yang dirender |

Endpoint **baca** (`GET`) tidak memotong kredit. `GET /v1/trends` juga gratis
(hanya meneruskan data tren eksternal). Tarif lengkap:
[docs/pricing.md](pricing.md) §4–§5.

---

## 8. Webhook keluar

### Event yang tersedia

```
post.published     post.failed       post.scheduled
render.completed   render.failed
media.imported     automation.triggered
```

### Bentuk request

```http
POST <url-anda>
Content-Type: application/json
x-sk-event: post.published
x-sk-signature: v1=<hex hmac-sha256>
x-sk-delivery: sk_whdel_<32 hex>

{"event":"post.published","deliveredAt":"2026-09-27T03:00:00.000Z","data":{...}}
```

### Verifikasi signature

Sign HMAC-SHA256 atas **body mentah** dengan secret endpoint Anda, lalu
bandingkan **constant-time**:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.startsWith("v1=") ? header.slice(3) : header;
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}
```

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    got = header[3:] if header.startswith("v1=") else header
    return hmac.compare_digest(got, expected)
```

> Pakai **body mentah** (string persis yang diterima), bukan hasil
> parse-lalu-stringify ulang — urutan key JSON bisa berubah dan signature
> akan gagal.

### Retry & dedup

- Gagal (non-2xx) → diulang **5×** dengan backoff 30s → 2m → 8m → 30m → 2j.
- Timeout **15 detik** per pengiriman. Balas `2xx` secepat mungkin; proses
  berat lakukan asinkron.
- Endpoint yang dinonaktifkan/dicabut → **gagal permanen, tanpa retry**.
- Event dengan `(endpoint, event, payload)` identik **tidak dikirim dua kali**
  — delivery boleh dianggap idempoten.
- Riwayat pengiriman: `GET /v1/webhooks/deliveries` atau UI **Settings → Webhook**.

---

## 9. Batasan yang diketahui

- Belum ada **OAuth2** — hanya bearer token.
- Belum ada **`Idempotency-Key`** untuk request tulis: POST yang di-retry bisa
  membuat dua resource.
- Pagination masih `page` / `perPage`, bukan cursor.
- Belum ada **IP allowlist** per key.
- Rate limit **seragam 60/menit** untuk semua paket.
- `webhooks:write` sudah ada di daftar scope tapi belum dipakai endpoint mana pun.

Daftar lengkap keputusan tertunda: [rfc-public-api.md](rfc-public-api.md) §13–§14.
