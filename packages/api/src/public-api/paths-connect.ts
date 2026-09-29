// Path OpenAPI untuk connect akun lewat API (docs/rfc-oauth-connect.md fase 3).
//
// MENGAPA path ditulis manual: handler /v1 adalah route /api lama yang di-mount
// ulang lewat allowlist — dokumen ini MENDESKRIPSIKANnya, bukan men-generate
// routenya. Sama seperti paths-read.ts / paths-phase3.ts.
import { PlatformEnum } from "./common";
import { errorResponses, jsonContent, op, pathParam } from "./paths-helpers";

const S = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/**
 * Path param `{platform}` — enum hanya berisi platform yang BENAR-BENAR
 * didukung (lihat PlatformEnum). Instagram punya dua jalur koneksi yang
 * menghasilkan akun berbeda: `instagram` (lewat Facebook Page) dan
 * `instagram_standalone` (Instagram Login langsung).
 */
const platformParam = () =>
  pathParam(
    "platform",
    "Platform tujuan. Instagram punya **dua jalur**: `instagram` (lewat Facebook Page, " +
      "metabolehkan comment & DM bersama Facebook) dan `instagram_standalone` (Instagram Login " +
      "langsung, untuk akun tanpa Page). Platform lain: `facebook`, `threads`, `tiktok`, " +
      "`youtube`, `pinterest`, `linkedin`, `linkedin_org`, `bluesky`, `google_business`.",
    { type: "string", enum: PlatformEnum.options },
  );

const CONFLICT = {
  "409": {
    description: "Akun platform ini sudah terhubung di organisasi lain.",
    content: { "application/json": { schema: S("ErrorResponse") } },
  },
};

const GONE = {
  "410": {
    description: "Sesi pemilihan akun kedaluwarsa — mulai ulang dari `authorize`.",
    content: { "application/json": { schema: S("ErrorResponse") } },
  },
};

const redirectParam = {
  name: "redirect",
  in: "query" as const,
  required: true,
  schema: { type: "string", format: "uri" },
  description:
    "Redirect URI milik Anda. WAJIB sudah terdaftar di allowlist developer app dan dicocokkan " +
    "PERSIS (tanpa wildcard, tanpa prefix match). Harus `https` — `http` hanya untuk localhost. " +
    "Tidak boleh mengandung fragment (`#`) karena akan menelan `code` yang kami tambahkan.",
};

/** Respons polimorfik connect/exchange — satu kontrak untuk semua platform. */
const CONNECT_RESPONSES = {
  "200": {
    description:
      "Selesai (`accountId`) atau butuh pemilihan aset (`pendingId` + `assets`). " +
      "Bercabanglah pada ada/tidaknya `pendingId`.",
    content: {
      "application/json": {
        schema: { oneOf: [S("ConnectAccountResponse"), S("ConnectPendingResponse")] },
      },
    },
  },
  ...errorResponses({ ...CONFLICT, ...GONE }),
};

export function buildConnectPaths() {
  return {
    "/v1/accounts/{platform}/authorize": {
      get: op({
        tags: ["Accounts"],
        summary: "Mulai OAuth untuk menghubungkan akun",
        description:
          "Mengembalikan URL otorisasi platform. Setelah pengguna menyetujui, kami mengalihkan " +
          "browser ke `redirect` Anda dengan `code` + `state` (atau `error` bila ditolak), lalu " +
          "Anda menukarkan `code` lewat `POST /v1/accounts/{platform}/connect`.\n\n" +
          "Butuh plan Business+ (`api_write`) dan API key yang terikat ke developer app.",
        scopes: ["accounts:write"],
        parameters: [platformParam(), redirectParam],
        responses: {
          "200": {
            description: "URL otorisasi platform.",
            content: jsonContent(S("AuthorizeResponse")),
          },
          ...errorResponses({
            "403": {
              description:
                "API key tidak terikat developer app yang aktif — tidak ada allowlist redirect yang bisa dipercaya.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/accounts/{platform}/connect": {
      post: op({
        tags: ["Accounts"],
        summary: "Tukar code menjadi akun terhubung",
        description:
          "Menukar `code` yang Anda terima di redirect URI. Bila platform perlu pemilihan aset " +
          "(Page Facebook, board Pinterest, channel YouTube, halaman LinkedIn), responsnya berisi " +
          "`pendingId` + `assets[]`; lanjutkan dengan `GET /v1/accounts/pending/{id}` dan " +
          "`POST /v1/accounts/pending/{id}/select`.\n\n" +
          "Daftar platform yang butuh pemilihan adalah detail internal kami dan berubah setiap kali " +
          "akses API platform disetujui — karena itu tidak ada status 400 khusus untuk itu.",
        scopes: ["accounts:write"],
        parameters: [platformParam()],
        requestBody: S("ConnectRequest"),
        responses: CONNECT_RESPONSES,
      }),
    },

    "/v1/accounts/{platform}/exchange": {
      post: op({
        tags: ["Accounts"],
        summary: "Tukar code lebih awal (tampilkan picker di depan)",
        description:
          "Perilaku & bentuk responsnya identik dengan `connect` — disediakan untuk alur yang ingin " +
          "menampilkan pemilihan aset lebih dulu. Pada platform yang tidak butuh pemilihan, " +
          "responsnya `{ accountId }` dan akun sudah terhubung.\n\n" +
          "`code` bersifat sekali pakai: panggil `connect` ATAU `exchange`, jangan keduanya.",
        scopes: ["accounts:write"],
        parameters: [platformParam()],
        requestBody: S("ConnectRequest"),
        responses: CONNECT_RESPONSES,
      }),
    },

    "/v1/accounts/pending/{id}": {
      get: op({
        tags: ["Accounts"],
        summary: "Daftar aset yang bisa dipilih",
        description:
          "Token aset TIDAK pernah dikirim — hanya id, nama, dan metadata tampilan. Sesi ini " +
          "berlaku 10 menit dan hanya boleh diselesaikan oleh organisasi pemiliknya.",
        scopes: ["accounts:write"],
        parameters: [pathParam("id", "`pendingId` dari respons connect/exchange.")],
        responses: {
          "200": {
            description: "Daftar aset untuk ditampilkan di picker Anda.",
            content: jsonContent(S("PendingSelectionResponse")),
          },
          ...errorResponses(GONE),
        },
      }),
    },

    "/v1/accounts/pending/{id}/select": {
      post: op({
        tags: ["Accounts"],
        summary: "Hubungkan aset terpilih",
        description:
          "Menyelesaikan pemilihan: aset yang dipilih dihubungkan sebagai akun organisasi. " +
          "Satu `pendingId` = satu aset; untuk memilih aset lain, mulai ulang dari `authorize`.",
        scopes: ["accounts:write"],
        parameters: [pathParam("id", "`pendingId` dari respons connect/exchange.")],
        requestBody: S("SelectAssetRequest"),
        responses: {
          "200": {
            description: "Akun terhubung.",
            content: jsonContent(S("SelectAssetResponse")),
          },
          ...errorResponses({ ...CONFLICT, ...GONE }),
        },
      }),
    },
  };
}
