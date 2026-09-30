// Pembangun dokumen OpenAPI Public API v1.
//
// Schema dikumpulkan otomatis dari registry zod-to-openapi (semua schema yang
// memanggil .openapi("Name")). Path ditulis manual di paths-read.ts &
// paths-phase3.ts karena handler /v1 adalah route /api lama yang di-mount
// ulang — dokumen ini mendeskripsikannya, bukan men-generate routenya.
import { extendZodWithOpenApi, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { publicApiRegistry } from "./common";
import { buildConnectPaths } from "./paths-connect";
import { withOperationIds } from "./paths-helpers";
import { buildPhase3Paths } from "./paths-phase3";
import { buildPublicApiPaths } from "./paths-read";
import { buildWebhookPaths } from "./paths-webhooks";
import { registerPublicApiSchemas } from "./register";

extendZodWithOpenApi(z);

registerPublicApiSchemas();

const SCOPES_DESCRIPTION = `Scope yang dibutuhkan key untuk endpoint ini. Key harus
memiliki minimal satu scope terdaftar (diberikan saat membuat key di Settings → API).
Lihat https://docs.sahabatkreator.com/api/authentication#scopes untuk daftar lengkap.`;

export function createPublicApiDocument() {
  const generator = new OpenApiGeneratorV31(publicApiRegistry.definitions);
  const { components } = generator.generateComponents();

  return {
    openapi: "3.1.0",
    info: {
      title: "Sahabat Kreator Public API",
      version: "1.0.0",
      description:
        "API publik untuk integrasi eksternal (Zapier, Make, MCP, dashboard klien). " +
        "Autentikasi: `Authorization: Bearer sk_api_...` atau `X-API-Key: sk_api_...`. " +
        "Rate limit 60 permintaan/menit per key. Endpoint tulis butuh plan Business+ (api_write).",
    },
    servers: [
      {
        url: "https://sahabatkreator.com/v1",
        description: "Production",
      },
      {
        url: "http://localhost:3000",
        description: "Local development",
      },
    ],
    tags: [
      { name: "System", description: "Cek koneksi & token" },
      { name: "Accounts", description: "Akun sosial organisasi" },
      { name: "Posts", description: "Membuat & mengelola post" },
      { name: "Analytics", description: "Performa konten" },
      { name: "Reports", description: "Laporan ringkas" },
      { name: "Media", description: "Media library" },
      { name: "Renders", description: "Render async: carousel, video, auto-clip" },
      { name: "Automation", description: "Aturan balasan otomatis" },
      { name: "AI", description: "Generator caption/hashtag/rewrite (mengonsumsi kredit)" },
      { name: "Trends", description: "Tren & ide konten" },
      {
        name: "Webhooks",
        description: "Audit pengiriman webhook keluar & daftar event",
      },
    ],
    paths: withOperationIds({
      ...buildPublicApiPaths(),
      ...buildPhase3Paths(),
      ...buildConnectPaths(),
      ...buildWebhookPaths(),
    }),
    components: {
      ...components,
      securitySchemes: {
        apiKeyAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "API key format `sk_api_<32 karakter>`. Dibuat di Settings → API. " +
            "Bisa juga dikirim via header `X-API-Key`.",
        },
      },
    },
    "x-scope-descriptions": SCOPES_DESCRIPTION,
  };
}

export const publicApiDocument = createPublicApiDocument();
