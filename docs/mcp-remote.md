# MCP remote — pakai agen AI tanpa instalasi

Endpoint **Streamable HTTP** di server kita: `POST /mcp`. Beda dengan
[`apps/mcp`](../apps/mcp/README.md) (stdio) yang harus dijalankan di mesin
pengguna, di sini klien cukup diarahkan ke satu URL.

| | stdio (`apps/mcp`) | HTTP (`POST /mcp`) |
|---|---|---|
| Yang harus disiapkan pengguna | Bun + repo di-clone + path absolut | URL + API key |
| Cocok untuk | pemilik repo, developer | pelanggan |
| Transport | stdio | Streamable HTTP (stateless) |
| Panduan | [apps/mcp/README.md](../apps/mcp/README.md) | dokumen ini |

Desain & keputusan: [docs/rfc-public-api.md](rfc-public-api.md) §7.

---

## 1. URL & kredensial

| Lingkungan | URL |
|---|---|
| Produksi | `https://sahabatkreator.com/mcp` |
| Staging | `https://app.sahabatkreator.com/mcp` |
| Dev (langsung ke server) | `http://localhost:3000/mcp` |
| Dev (lewat Vite, same-origin) | `http://localhost:5173/mcp` |

Kredensialnya **API key creator yang sama** dengan `/v1` (Settings → API):
`Authorization: Bearer sk_api_...`.

Tool yang muncul mengikuti **scope key**. Key read-only tidak akan pernah
melihat tool tulis — kalau tool yang Anda harapkan tidak muncul, hampir selalu
penyebabnya scope, bukan koneksi.

---

## 2. Menyiapkan klien

### Claude Code (CLI)

```bash
claude mcp add sahabatkreator \
  --transport http \
  https://sahabatkreator.com/mcp \
  --header "Authorization: Bearer sk_api_..."
```

### Cursor / Windsurf / VS Code

Tambahkan ke `mcp.json`:

```json
{
  "mcpServers": {
    "sahabatkreator": {
      "url": "https://sahabatkreator.com/mcp",
      "headers": { "Authorization": "Bearer sk_api_..." }
    }
  }
}
```

### ChatGPT — Responses API / Agents SDK

MCP adalah tipe tool bawaan; cukup teruskan bearer token:

```ts
const response = await client.responses.create({
  model: "gpt-5.1",
  tools: [
    {
      type: "mcp",
      server_label: "sahabatkreator",
      server_url: "https://sahabatkreator.com/mcp",
      authorization: `Bearer ${process.env.SAHABATKREATOR_API_KEY}`,
      require_approval: "always",
    },
  ],
  input: "Tampilkan 5 post dengan engagement tertinggi.",
});
```

### claude.ai web & Claude Desktop (Connectors)

claude.ai (dan Claude Desktop yang memakai panel Connectors) mendukung
**remote MCP server by URL**. Autentikasi tetap API key kita — lewat
**Request headers**, BUKAN OAuth (yang memang masih belum kita sediakan,
§4). Syaratnya: header-nya harus nama standar (`authorization`,
`x-api-key`, atau `x-auth-token`) — kita terima ketiganya, jadi aman.

> **Status beta:** Request headers belum tersedia untuk semua organisasi
> Claude. Kalau Anda tidak melihat bagian **Request headers** di dialog
> *Add custom connector*, org Anda belum diizinkan; minta akses ke
> `mcp-review@anthropic.com`. Selama itu, pakai Claude Code (di atas)
> atau transport stdio di [apps/mcp/README.md](../apps/mcp/README.md).

> **Peringatan "required sign-in" saat menambah konektor itu NORMAL.**
> Saat URL dimasukkan, Claude mengecek server **tanpa** header yang
> belum Anda konfigurasi — server kita memang membalas **401** (API key
> wajib, §1), lalu Claude menandai **"Sign in now — Detected"** dan
> memperingatkan bahwa *No sign-in* "will likely fail". Itu heuristik
> dari probe tanpa kredensial; Claude tidak bisa membedakan "butuh OAuth"
> dengan "butuh API key statis". **Abaikan dan simpan saja**, selama
> bagian *Request headers* sudah berisi `Bearer sk_api_...` — setelah
> tersimpan, Claude mengirim header itu di **setiap** request, jadi
> handshake sebenarnya berhasil. (Bila ternyata gagal juga, lihat
> pembedaan di §6.)

Langkahnya (plan pribadi Free/Pro/Max; di Team/Enterprise hanya **Owner**
yang bisa menambah konektor org — anggota lain memakai
`https://claude.ai/admin-settings/connectors`):

1. Buka **Settings → Customize → Connectors** (atau **Organization
   settings → Connectors** untuk org), klik **Add custom connector**.
2. **MCP server URL**:
   `https://sahabatkreator.com/mcp` (produksi) atau
   `https://app.sahabatkreator.com/mcp` (staging).
3. **Authentication** → pilih **No sign-in**. (Jangan pilih "Sign in
   now"/"Sign in when needed" — itu menuntut OAuth, §4.)
4. Buka **Request headers** → pilih header `authorization` → isi value
   persis: `Bearer sk_api_...` (ketik "Bearer " beserta spasinya — Claude
   mengirim nilai apa adanya tanpa menambah skema).
5. Tandai **Required**, klik **Add**.

Setelah konektor ditambah, tool mulai dalam keadaan **Not set** — Claude
akan bertanya sebelum memakai tool mana pun. Atur per-tool ke
**Auto-use** untuk tool baca (`list_posts`, dll.) kalau ingin jalan
tanpa konfirmasi. Tool yang muncul tetap mengikuti **scope key**
(§1); key read-only tidak akan melihat tool tulis.

Beberapa hal yang sering jadi pertanyaan:

- **Tidak bisa mengubah auth setelah disimpan.** Ganti API key = hapus
  konektornya, tambah ulang, dan semua anggota harus reconnect.
- **Nilai header tidak ditampilkan lagi setelah disimpan** — memang
  begitu; simpan key-nya di tempat lain.
- **Satu key untuk satu konektor org** — semua anggota org yang
  terhubung memakai key yang sama. Karena kuota `/v1` dihitung **per
  key** (60 `tools/call` per menit), konektor yang dipakai banyak orang
  berbagi kuota itu. Untuk pemakaian per-orang, masing-masing tambah
  konektor sendiri dengan key sendiri di plan pribadi.
- Egress Claude datang dari `160.79.104.0/21` — allowlist itu kalau
  firewall server membatasi inbound (jarang diperlukan di belakang
  Cloudflare).

---

## 3. Rate limit

| Permukaan | Batas | Dihitung dari |
|---|---|---|
| handshake (`initialize`, `tools/list`, `notifications/*`) | 120 / menit per key | limiter `/mcp` |
| `tools/call` | 60 / menit per key | kuota `/v1` |

Satu `tools/call` = satu request `/v1`. Kuota tool karena itu **sama** dengan
kuota Public API biasa — memanggil tool lewat MCP tidak memberi jatah
tambahan, dan sebaliknya.

> **Perhatikan untuk agen:** 60 tool call per menit terasa ketat. Satu turn
> percakapan yang menelusuri beberapa akun + beberapa periode bisa memakai
> belasan call. Batas ini masih seragam untuk semua paket — peningkatan ke
> limit bertingkat per paket ada di daftar kerja
> ([rfc §13](rfc-public-api.md)). Sampai itu ada, desain prompt agen Anda
> supaya tidak menggulir banyak periode dalam satu turn.

429 dari limiter handshake dibalas dalam bentuk JSON-RPC (`error.code`
`-32000`) beserta header `Retry-After`, jadi klien MCP bisa mundur dengan benar.

---

## 4. Batasan yang diketahui

| Batasan | Sebab |
|---|---|
| `GET`/`DELETE /mcp` → **405** | Stateless: tidak ada pesan server→klien untuk di-stream, tidak ada sesi untuk ditutup |
| Tidak ada sampling / elicitation / progress notification | Semua tool request/response sederhana; mode stateless |
| ChatGPT Connectors belum bisa | Menuntut OAuth 2.1 (discovery, DCR/CIMD, PKCE) — belum dibangun. claude.ai web connector **sudah bisa** lewat Request headers (API key, beta per-org), lihat §2 |
| Tidak ada resumability SSE | Transport menjawab JSON, bukan SSE (lihat [rfc §7.2](rfc-public-api.md)) |

Klien yang **bisa** mengirim header sendiri — Claude Code, Cursor, Windsurf,
claude.ai web & Claude Desktop (Request headers), ChatGPT Responses API —
sudah terlayani tanpa OAuth.

---

## 5. Verifikasi manual

Handshake tanpa klien, cukup `curl`:

```bash
# 1. initialize
curl -s https://sahabatkreator.com/mcp \
  -H "authorization: Bearer sk_api_..." \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# 2. daftar tool (yang muncul sesuai scope key)
curl -s https://sahabatkreator.com/mcp \
  -H "authorization: Bearer sk_api_..." \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 3. panggil tool
curl -s https://sahabatkreator.com/mcp \
  -H "authorization: Bearer sk_api_..." \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_posts","arguments":{"perPage":5}}}'
```

Respons langkah 2 menyertakan `title` + `annotations` per tool
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). Klien
memakainya untuk keputusan izin — tool dengan `readOnlyHint: true` boleh
dipanggil tanpa konfirmasi — dan direktori Connector Claude menuntut field ini
ada.

---

## 6. Troubleshooting

| Gejala | Sebab |
|---|---|
| `401` | Header hilang/salah, token dicabut, atau key kedaluwarsa |
| `402` | Plan org tidak punya `api_access` |
| Tool yang diharapkan tidak muncul | Scope key tidak mencakup resource itu — buat key baru |
| `Tool ... not found` saat dipanggil | Sama: tool-nya memang tidak didaftarkan untuk scope key ini |
| `405` | Memakai `GET` — MCP di sini hanya `POST` |
| Error tool berisi `403` | Key tidak punya scope untuk endpoint itu (dicek ulang di `/v1`) |
| Error tool berisi `429` | Kuota `/v1` habis (60/menit per key) |
| Klien bilang "cannot be reached" | URL salah, atau bukan HTTPS di produksi |
| Peringatan "required sign-in" / **Sign in now — Detected** di dialog *Add custom connector* claude.ai | Probe Claude tanpa kredensial dapat 401 kita — **normal dan aman diabaikan** selama *Request headers* terisi (`Bearer sk_api_...`). Lihat catatan di §2 |
| Konektor claude.ai benar-benar gagal connect walau header terisi | Cek dulu server-side dengan `curl` §5 langkah 1–2: kalau dua-duanya lulus, berarti org Claude belum punya akses beta `static_headers` (bagian *Request headers* tak pernah muncul) → header tidak pernah dikirim. Pakai Claude Code (§2) sampai beta keluar |
| Bagian **Request headers** tidak ada di dialog sama sekali | Org Claude belum diizinkan beta `static_headers` — header tidak akan dikirim, koneksi pasti 401. Alternatif: Claude Code CLI atau stdio |
