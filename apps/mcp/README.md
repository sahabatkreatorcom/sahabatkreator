# Sahabat Kreator MCP Server

Adapter **stdio** tipis di atas Public API `/v1`. Setiap tool MCP = satu
endpoint `/v1`, jadi tidak ada logika bisnis di sini — satu sumber kebenaran
tetap handler `/api`.

Berguna untuk memberi agen AI (Claude Desktop, Cursor, klien MCP lain) akses
terkendali ke data organisasi Anda **tanpa** menyerahkan cookie session.

Desain & keputusan: [docs/rfc-public-api.md](../../docs/rfc-public-api.md) §7.

> **Ada dua transport.** Yang ini (stdio) dijalankan di mesin pengguna dan
> menuntut Bun + repo ini di-clone. Kalau yang dibutuhkan adalah pelanggan yang
> tidak bisa meng-install apa pun, pakai **MCP remote** di `POST /mcp` — cukup
> URL + API key. Panduannya: [docs/mcp-remote.md](../../docs/mcp-remote.md).
>
> Tabel tool kedua transport identik karena berasal dari satu file:
> `packages/api/src/mcp/tools.ts`.

---

## 1. Prasyarat

1. **API key** — buat di aplikasi: **Settings → API → Buat key**.
   Token ditampilkan **sekali saja**; simpan langsung.
2. **Plan yang mendukung** — `api_access` (Pro ke atas). Endpoint tulis butuh
   `api_write` (Bisnis ke atas). Definisi paket ada di
   `packages/db/scripts/seed.ts`; label & key fitur di
   `apps/web/src/lib/feature-catalog.ts`.
3. **Bun** terpasang (repo ini memakai Bun; `node` juga bisa bila SDK-nya
   tersedia).

### Scope menentukan tool yang muncul

Tool MCP **mengikuti scope token** — token read-only tidak akan pernah melihat
tool tulis. Pilih scope saat membuat key:

| Tool | Scope |
|---|---|
| `ping` | — (selalu tersedia) |
| `list_accounts` | `accounts:read` |
| `list_posts`, `get_post` | `posts:read` |
| `analytics_overview`, `analytics_top_posts` | `analytics:read` |
| `report_summary` | `reports:read` |
| `list_media` | `media:read` |
| `render_manifest` | `renders:read` |
| `list_automation` | `automation:read` |
| `webhook_deliveries` | `webhooks:read` |
| `trends` | `ai:read` |
| `ai_caption`, `ai_hashtag` | `ai:write` |

`ai_caption` dan `ai_hashtag` **mengonsumsi kredit AI** — tarifnya sama dengan
pemakaian lewat UI.

---

## 2. Menjalankan

```bash
# Cara 1 — env
SAHABATKREATOR_API_KEY=sk_live_... bun run start

# Cara 2 — argumen pertama
bun run start sk_live_...
```

| Env | Default | Keterangan |
|---|---|---|
| `SAHABATKREATOR_API_KEY` | — (wajib) | Token `sk_live_...` |
| `SERVER_URL` | `http://localhost:3000` | Origin API, **tanpa** trailing slash |

Saat boot, server memanggil `GET /v1/ping` sekali untuk memverifikasi token dan
membaca scope-nya, lalu menulis ringkasan ke stderr:

```
[mcp] Sahabat Kreator MCP server berjalan (9 tool, scope token: accounts:read, posts:read)
```

Kalau baris ini muncul dengan `scope token: none`, token valid tapi belum
diberi scope apa pun — hanya `ping` yang akan tersedia.

---

## 3. Konfigurasi klien MCP

### Claude Desktop

`claude_desktop_config.json`
(Windows: `%APPDATA%\Claude\` · macOS: `~/Library/Application Support/Claude/`)

```json
{
  "mcpServers": {
    "sahabatkreator": {
      "command": "bun",
      "args": ["run", "<ABSOLUTE_PATH_TO_REPO>/apps/mcp/src/index.ts"],
      "env": {
        "SAHABATKREATOR_API_KEY": "sk_live_...",
        "SERVER_URL": "https://sahabatkreator.com"
      }
    }
  }
}
```

- Ganti `<ABSOLUTE_PATH_TO_REPO>` dengan path absolut repo ini.
- Di Windows pakai garis miring `/` (`E:/PROJECTS/...`) atau `\\` ganda.
- `SERVER_URL` **wajib** diisi bila API bukan localhost — defaultnya
  `http://localhost:3000`.

### Klien lain (Cursor, Windsurf, dsb.)

Konfigurasinya sama: command `bun`, argumen `run <path>/apps/mcp/src/index.ts`,
dan dua env di atas. Protokolnya stdio — **bukan** HTTP/SSE.

---

## 4. Troubleshooting

| Gejala | Sebab |
|---|---|
| `SAHABATKREATOR_API_KEY belum diset` | Env belum diisi dan tidak ada argumen pertama |
| `Gagal memverifikasi token: ... 401` | Token salah/dicabut/kedaluwarsa, atau `SERVER_URL` salah |
| `Gagal memverifikasi token: ... 402` | Plan org tidak punya `api_access` |
| Tool tulis tidak muncul di klien | Token tidak punya scope `*:write` — buat key baru |
| `Token tidak punya scope "..."` | Tool dipanggil padahal scope-nya tidak ada di token |
| `429` | Rate limit `/v1` — 60 permintaan/menit **per key** |
| `403` | Key tidak punya scope untuk endpoint itu |

Ingat: **key mati otomatis** bila pembuatnya dikeluarkan dari organisasi
(role di-resolve live dari tabel `member`). Kalau tiba-tiba 401 padahal token
baru, periksa keanggotaan org pembuat key.

---

## 5. Menambah tool baru

1. Tambahkan entri di array `MCP_TOOLS`
   (**`packages/api/src/mcp/tools.ts`** — bukan di app ini) — `name`, `title`,
   `description`, `scope`, `method`, `path`, dan `params` (zod). Satu file itu
   dipakai bersama transport stdio dan HTTP, jadi perubahan di sini langsung
   berlaku di keduanya. `title` **wajib** (klien memakainya sebagai label tool);
   set `openWorld: true` bila tool memanggil LLM atau mengambil data dari web.
2. **Endpoint-nya harus sudah ada di allowlist `/v1`**
   (`apps/server/src/routes/v1/index.ts`). Tool tidak bisa memanggil path yang
   tidak diekspos.
3. Bila path-nya baru, tambahkan juga di dokumen OpenAPI
   (`packages/api/src/public-api/`) lalu jalankan `openapi:gen` — kalau tidak,
   `openapi:verify` akan gagal.
4. Tambahkan test pemetaan argumennya di
   `packages/api/src/mcp/tools.test.ts` (path param tidak boleh dobel ke
   query/body, `undefined` harus dibuang). Invarian path/scope/keunikan nama
   sudah dijaga test yang sama.

Scope di definisi tool dipakai untuk dua hal: menyembunyikan tool dari klien
saat token tidak punya scope itu, dan gagal cepat sebelum request dikirim.

Anotasi MCP (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`) **tidak ditulis manual per tool** — `toolAnnotations()`
menurunkannya dari `scope` dan `method`, supaya anotasi tidak pernah berbeda
dari perilaku tool yang sebenarnya. Klien memakai anotasi untuk memutuskan
apakah sebuah tool boleh dipanggil tanpa konfirmasi pengguna, dan direktori
Connector Claude mensyaratkannya ada — tool tanpa anotasi akan gagal review.
