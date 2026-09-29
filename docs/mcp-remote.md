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

### Claude Desktop

Untuk server **remote**, Claude Desktop memakai jalur **Connectors** di
Settings. Jalur itu menuntut OAuth, yang **belum** kita sediakan (§4). Selama
itu, pakai transport stdio di
[apps/mcp/README.md](../apps/mcp/README.md) — itu yang didukung penuh hari ini.

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
| ChatGPT Connectors & claude.ai web connector belum bisa | Keduanya menuntut OAuth 2.1 (discovery, DCR/CIMD, PKCE) — belum dibangun |
| Tidak ada resumability SSE | Transport menjawab JSON, bukan SSE (lihat [rfc §7.2](rfc-public-api.md)) |

Klien yang **bisa** mengirim header sendiri — Claude Code, Cursor, Windsurf,
Claude Desktop config, ChatGPT Responses API — sudah terlayani tanpa OAuth.

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
