// Path OpenAPI untuk endpoint Fase 3 (render async + AI + trends).
import { errorResponses, jsonContent, op, pathParam, queryParam } from "./paths-helpers";

const S = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export function buildPhase3Paths() {
  return {
    "/v1/carousel": {
      post: op({
        tags: ["Renders"],
        summary: "Buat job carousel",
        description:
          "Membuat job render carousel asinkron. Poll `GET /v1/carousel/{id}` untuk status.",
        scopes: ["renders:write"],
        requestBody: S("CreateCarouselRequest"),
        responses: {
          "201": {
            description: "Job dibuat dan diantrikan.",
            content: jsonContent(S("CreateCarouselResponse")),
          },
          ...errorResponses({
            "503": {
              description: "Fitur carousel belum dikonfigurasi (MODAL_TOKEN/MODAL_CAROUSEL_URL).",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/carousel/{id}": {
      get: op({
        tags: ["Renders"],
        summary: "Status job carousel",
        description: "Polling status job + slide yang sudah ter-render.",
        scopes: ["renders:write"],
        parameters: [pathParam("id", "ID job")],
        responses: {
          "200": {
            description: "Status job.",
            content: jsonContent(S("CarouselJobResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/video": {
      post: op({
        tags: ["Renders"],
        summary: "Buat job video",
        description:
          "Merakit video dari base video + clip + voiceover + caption. Poll `GET /v1/video/{id}`.",
        scopes: ["renders:write"],
        requestBody: S("CreateVideoRequest"),
        responses: {
          "201": {
            description: "Job dibuat.",
            content: jsonContent(S("CreateVideoResponse")),
          },
          ...errorResponses({
            "503": {
              description: "Fitur render video belum dikonfigurasi (MODAL_TOKEN/MODAL_RENDER_URL).",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/video/{id}": {
      get: op({
        tags: ["Renders"],
        summary: "Status job video",
        scopes: ["renders:write"],
        parameters: [pathParam("id", "ID job")],
        responses: {
          "200": { description: "Status job.", content: jsonContent(S("VideoJobResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/auto-clip": {
      post: op({
        tags: ["Renders"],
        summary: "Buat job auto-clip",
        description:
          "Mendeteksi momen viral dari video sumber. Pakai `sourceUrl` atau `baseVideoMediaId`. Pilih kandidat lewat `POST /v1/auto-clip/{id}/select`.",
        scopes: ["renders:write"],
        requestBody: S("CreateAutoClipRequest"),
        responses: {
          "201": {
            description: "Job dibuat + rentang terdeteksi.",
            content: jsonContent(S("CreateAutoClipResponse")),
          },
          ...errorResponses({
            "503": {
              description: "Fitur auto-clip belum dikonfigurasi (MODAL_CLIPPER_URL/TOKEN).",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/auto-clip/{id}": {
      get: op({
        tags: ["Renders"],
        summary: "Status job auto-clip",
        scopes: ["renders:write"],
        parameters: [pathParam("id", "ID job")],
        responses: {
          "200": {
            description: "Status job + kandidat segmen.",
            content: jsonContent(S("AutoClipJobResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/auto-clip/{id}/select": {
      post: op({
        tags: ["Renders"],
        summary: "Pilih kandidat auto-clip",
        description:
          "Memilih segmen yang akan dirender. Fan-out: `renderJobIds[]` berisi job render video.",
        scopes: ["renders:write"],
        parameters: [pathParam("id", "ID job")],
        requestBody: S("SelectAutoClipRequest"),
        responses: {
          "200": {
            description: "Segmen dipilih, job render dibuat.",
            content: jsonContent(S("SelectAutoClipResponse")),
          },
          ...errorResponses({
            "409": {
              description: "Analisis belum selesai / kandidat sudah dirender.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/ai/usage": {
      get: op({
        tags: ["AI"],
        summary: "Pemakaian kredit AI",
        description: "Kredit AI organisasi bulan berjalan.",
        scopes: ["ai:read"],
        responses: {
          "200": { description: "Pemakaian kredit.", content: jsonContent(S("AiUsageResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/ai/caption": {
      post: op({
        tags: ["AI"],
        summary: "Generate caption",
        description: "Membuat caption + hashtag. Mengonsumsi kredit AI.",
        scopes: ["ai:write"],
        requestBody: S("CaptionRequest"),
        responses: {
          "200": { description: "Caption + hashtag.", content: jsonContent(S("CaptionResponse")) },
          ...errorResponses({
            "503": {
              description: "Fitur AI belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/ai/hashtag": {
      post: op({
        tags: ["AI"],
        summary: "Generate hashtag",
        description: "Membuat hashtag dari prompt. Mengonsumsi kredit AI.",
        scopes: ["ai:write"],
        requestBody: S("HashtagRequest"),
        responses: {
          "200": { description: "Daftar hashtag.", content: jsonContent(S("HashtagResponse")) },
          ...errorResponses({
            "503": {
              description: "Fitur AI belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/ai/rewrite": {
      post: op({
        tags: ["AI"],
        summary: "Tulis ulang teks",
        description: "Menulis ulang teks sesuai gaya. Mengonsumsi kredit AI.",
        scopes: ["ai:write"],
        requestBody: S("RewriteRequest"),
        responses: {
          "200": { description: "Teks hasil.", content: jsonContent(S("RewriteResponse")) },
          ...errorResponses({
            "503": {
              description: "Fitur AI belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/ai/repurpose": {
      post: op({
        tags: ["AI"],
        summary: "Reuse konten lintas platform",
        description: "Mengubah konten untuk platform lain. Mengonsumsi kredit AI.",
        scopes: ["ai:write"],
        requestBody: S("RepurposeRequest"),
        responses: {
          "200": { description: "Konten hasil.", content: jsonContent(S("RepurposeResponse")) },
          ...errorResponses({
            "503": {
              description: "Fitur AI belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },

    "/v1/trends": {
      get: op({
        tags: ["Trends"],
        summary: "Tren harian",
        description: "Tren Google Indonesia (tidak mengonsumsi kredit AI).",
        scopes: ["ai:read"],
        parameters: [
          queryParam("limit", { type: "integer", default: 20, minimum: 1, maximum: 40 }),
        ],
        responses: {
          "200": { description: "Daftar tren.", content: jsonContent(S("TrendsResponse")) },
          ...errorResponses(),
        },
      }),
    },

    "/v1/trends/ideas": {
      post: op({
        tags: ["Trends"],
        summary: "Ide konten dari tren",
        description: "Membuat ide konten dari satu tren. Mengonsumsi kredit AI.",
        scopes: ["ai:write"],
        requestBody: S("TrendIdeasRequest"),
        responses: {
          "200": {
            description: "Ide konten.",
            content: jsonContent(S("TrendIdeasResponse")),
          },
          ...errorResponses({
            "502": {
              description: "AI mengembalikan format yang tidak bisa dibaca.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
            "503": {
              description: "Fitur AI belum dikonfigurasi.",
              content: { "application/json": { schema: S("ErrorResponse") } },
            },
          }),
        },
      }),
    },
  };
}
