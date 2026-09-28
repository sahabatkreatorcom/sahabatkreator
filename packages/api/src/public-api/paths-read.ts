// Path OpenAPI untuk endpoint Fase 1 (read) + Fase 2 (write).
import { errorResponses, jsonContent, op, pathParam, queryParam } from "./paths-helpers";

const S = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export function buildPublicApiPaths() {
  return {
    "/v1/ping": {
      get: op({
        tags: ["System"],
        summary: "Cek koneksi & token",
        description:
          "Satu-satunya endpoint tanpa scope. Membuktikan key valid, plan layak memakai /v1, dan mengembalikan identitas organisasi + scope key.",
        scopes: [],
        responses: {
          "200": { description: "Key valid.", content: jsonContent(S("PingResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/accounts": {
      get: op({
        tags: ["Accounts"],
        summary: "Daftar akun sosial",
        description: "Semua akun sosial milik organisasi (termasuk status koneksi).",
        scopes: ["accounts:read"],
        responses: {
          "200": { description: "Daftar akun.", content: jsonContent(S("AccountsResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/accounts/{id}/statistic": {
      get: op({
        tags: ["Accounts"],
        summary: "Statistik akun (bridge)",
        description:
          "Statistik real-time satu akun via bridge Repliz. Akun non-bridge membalas 400/503.",
        scopes: ["accounts:read"],
        parameters: [pathParam("id", "ID akun")],
        responses: {
          "200": {
            description: "Statistik akun.",
            content: jsonContent(S("AccountStatisticResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/posts": {
      get: op({
        tags: ["Posts"],
        summary: "Daftar post",
        description: "Daftar grup post (draft, terjadwal, sudah tayang) milik organisasi.",
        scopes: ["posts:read"],
        parameters: [
          queryParam("from", { type: "string" }, "Filter YYYY-MM-DD"),
          queryParam("to", { type: "string" }, "Filter YYYY-MM-DD"),
          queryParam("status", { type: "string" }, "Filter status post"),
          queryParam("includeExternal", { type: "string", enum: ["1"] }, "Sertakan post eksternal"),
          queryParam("page", { type: "integer", default: 1 }),
          queryParam("perPage", { type: "integer", default: 50, minimum: 1, maximum: 100 }),
        ],
        responses: {
          "200": { description: "Daftar post.", content: jsonContent(S("PostsListResponse")) },
          ...errorResponses(),
        },
      }),
      post: op({
        tags: ["Posts"],
        summary: "Buat post",
        description:
          "Membuat grup post baru. Bila `scheduledAt` diisi, menjadwalkannya (butuh fitur scheduled_posts).",
        scopes: ["posts:write"],
        requestBody: S("CreatePostRequest"),
        responses: {
          "201": {
            description: "Grup post dibuat.",
            content: jsonContent(S("CreatePostResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/posts/{id}": {
      get: op({
        tags: ["Posts"],
        summary: "Detail post",
        scopes: ["posts:read"],
        parameters: [pathParam("id", "ID grup post")],
        responses: {
          "200": {
            description: "Detail grup post + post items.",
            content: jsonContent(S("PostDetailResponse")),
          },
          ...errorResponses(),
        },
      }),
      delete: op({
        tags: ["Posts"],
        summary: "Hapus post",
        scopes: ["posts:write"],
        parameters: [pathParam("id", "ID grup post")],
        responses: {
          "200": { description: "Post dihapus.", content: jsonContent(S("DeleteResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/posts/{id}/publish": {
      post: op({
        tags: ["Posts"],
        summary: "Publish segera",
        description:
          "Mem- enqueue publish untuk post yang bisa dipublish. Membalas `{ok,queued}` bila masuk queue, atau `{ok,published,processing,failed}` bila dikerjakan inline.",
        scopes: ["posts:write"],
        parameters: [pathParam("id", "ID grup post")],
        responses: {
          "200": {
            description: "Hasil publish.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [S("PublishQueuedResponse"), S("PublishInlineResponse")],
                },
              },
            },
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/posts/{id}/retry": {
      post: op({
        tags: ["Posts"],
        summary: "Ulang publish post gagal",
        description: "Hanya untuk post berstatus failed yang punya schedule bridge.",
        scopes: ["posts:write"],
        parameters: [pathParam("id", "ID grup post")],
        responses: {
          "200": { description: "Retry dijalankan.", content: jsonContent(S("RetryResponse")) },
          ...errorResponses({
            "503": {
              description: "Bridge Repliz belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/analytics/overview": {
      get: op({
        tags: ["Analytics"],
        summary: "Ringkasan performa",
        description:
          "Pakai `from`+`to` (YYYY-MM-DD) atau `days` (default 30). Mode from/to mengembalikan `comparison`.",
        scopes: ["analytics:read"],
        parameters: [
          queryParam("from", { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "YYYY-MM-DD"),
          queryParam("to", { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "YYYY-MM-DD"),
          queryParam("days", { type: "integer", default: 30, minimum: 1, maximum: 365 }),
        ],
        responses: {
          "200": {
            description: "Ringkasan + totals.",
            content: jsonContent(S("AnalyticsOverviewResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/analytics/timeseries": {
      get: op({
        tags: ["Analytics"],
        summary: "Deret waktu engagement",
        scopes: ["analytics:read"],
        parameters: [
          queryParam("days", { type: "integer", default: 30, minimum: 1, maximum: 365 }),
        ],
        responses: {
          "200": {
            description: "Series harian.",
            content: jsonContent(S("AnalyticsTimeseriesResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/analytics/top-posts": {
      get: op({
        tags: ["Analytics"],
        summary: "Post teratas",
        scopes: ["analytics:read"],
        parameters: [
          queryParam("limit", { type: "integer", default: 10, minimum: 1 }),
          queryParam("platform", { type: "string" }),
        ],
        responses: {
          "200": {
            description: "Post teratas.",
            content: jsonContent(S("AnalyticsTopPostsResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/reports/summary": {
      get: op({
        tags: ["Reports"],
        summary: "Ringkasan laporan",
        description: "Ringkasan periode (default 30 hari terakhir).",
        scopes: ["reports:read"],
        parameters: [
          queryParam("from", { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "YYYY-MM-DD"),
          queryParam("to", { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "YYYY-MM-DD"),
        ],
        responses: {
          "200": {
            description: "Ringkasan laporan.",
            content: jsonContent(S("ReportSummaryResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/media": {
      get: op({
        tags: ["Media"],
        summary: "Daftar media",
        description: "Item media library (maks 200).",
        scopes: ["media:read"],
        parameters: [queryParam("folderId", { type: "string" })],
        responses: {
          "200": { description: "Daftar media.", content: jsonContent(S("MediaListResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/media/import": {
      post: op({
        tags: ["Media"],
        summary: "Import media dari URL",
        description: "Mengunduh file dari URL publik ke media library organisasi.",
        scopes: ["media:write"],
        requestBody: S("ImportMediaRequest"),
        responses: {
          "201": { description: "Media diimpor.", content: jsonContent(S("ImportMediaResponse")) },
          ...errorResponses({
            "503": {
              description: "Storage R2 belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/renders/manifest": {
      get: op({
        tags: ["Renders"],
        summary: "Manifest render",
        description: "Daftar hasil render video organisasi (maks 200).",
        scopes: ["renders:read"],
        responses: {
          "200": {
            description: "Manifest render.",
            content: jsonContent(S("RenderManifestResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/automation": {
      get: op({
        tags: ["Automation"],
        summary: "Daftar aturan automation",
        description: "Butuh fitur plan `automation`.",
        scopes: ["automation:read"],
        responses: {
          "200": {
            description: "Aturan + akun yang terhubung.",
            content: jsonContent(S("AutomationListResponse")),
          },
          ...errorResponses(),
        },
      }),
      post: op({
        tags: ["Automation"],
        summary: "Buat aturan automation",
        scopes: ["automation:write"],
        requestBody: S("AutomationRuleRequest"),
        responses: {
          "201": {
            description: "Aturan dibuat.",
            content: jsonContent(S("AutomationRuleResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/automation/{id}": {
      patch: op({
        tags: ["Automation"],
        summary: "Ubah aturan automation",
        description: "Semua field opsional (patch).",
        scopes: ["automation:write"],
        parameters: [pathParam("id", "ID aturan")],
        requestBody: S("AutomationRuleRequest"),
        responses: {
          "200": {
            description: "Aturan diubah.",
            content: jsonContent(S("AutomationRuleResponse")),
          },
          ...errorResponses(),
        },
      }),
      delete: op({
        tags: ["Automation"],
        summary: "Hapus aturan automation",
        scopes: ["automation:write"],
        parameters: [pathParam("id", "ID aturan")],
        responses: {
          "200": { description: "Aturan dihapus.", content: jsonContent(S("DeleteResponse")) },
          ...errorResponses(),
        },
      }),
    },
  };
}
