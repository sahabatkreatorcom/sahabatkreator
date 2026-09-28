// Codegen tipe API untuk web — menghasilkan src/lib/api-schema.d.ts.
//
// MENGAPA: sebelumnya tipe response ditulis tangan di tiap page
// (type Overview = {...} di analytics.tsx, type BillingStatus di billing.tsx,
// dst.). Tipe itu TIDAK terverifikasi terhadap server — bisa diam-diam beda
// (field ganti nama, optional vs required) dan compiler tidak pernah komplain.
//
// Script ini mengambil dokumen OpenAPI yang sudah didefinisikan di packages/api
// (createOpenApiDocument untuk /health + /private, createPublicApiDocument
// untuk seluruh Public API v1) dan mengubahnya jadi deklarasi tipe. Tidak
// perlu server jalan — dokumen dibangun murni dari schema zod di packages/api.
//
// CATATAN KETERBATASAN: router /api (session cookie, 60+ file route) belum
// memakai @hono/zod-openapi route definitions, jadi BELUM ada kontrak
// OpenAPI untuknya. Saat ini hanya /v1 + /health + /private yang tercover.
// Migrasi router /api ke zod-openapi adalah pekerjaan terpisah (besar);
// setelah selesai, dokumen ini akan otomatis meng-cover semuanya tanpa
// perubahan script — cukup tambahkan ke OPENAPI_DOCS di bawah.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";
import { createOpenApiDocument, createPublicApiDocument } from "@sahabatkreator/api";

async function main() {
  const docs = [
    { label: "internal", doc: createOpenApiDocument() },
    { label: "v1", doc: createPublicApiDocument() },
  ];

  // Gabungkan dokumen: paths + components.schemas dari keduanya. Ref $ref masih
  // menunjuk ke #/components/schemas/<Name> sehingga penggabungan aman selama
  // nama schema tidak bentrok (registry v1 sudah prefixed).
  const merged = {
    openapi: "3.1.0",
    info: { title: "sahabatkreator API (codegen)", version: "0.1.0" },
    servers: [{ url: "http://localhost:3000", description: "Local development server" }],
    paths: Object.assign({}, ...docs.map((d) => d.doc.paths)),
    components: {
      schemas: Object.assign({}, ...docs.map((d) => d.doc.components?.schemas ?? {})),
      securitySchemes: Object.assign({}, ...docs.map((d) => d.doc.components?.securitySchemes ?? {})),
    },
  };

  const tmpPath = resolve(process.cwd(), "openapi.codegen.json");
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2));

  const ast = await openapiTS(new URL(`file://${tmpPath.replace(/\\/g, "/")}`));
  const outDir = resolve(process.cwd(), "src/lib");
  mkdirSync(outDir, { recursive: true });

  const header = `// ⚠️ FILE INI DI-GENERATE — jangan edit manual.
// Regenerasi: bun run codegen:openapi (apps/web)
// Sumber: packages/api (createOpenApiDocument + createPublicApiDocument).
// Kontrak untuk router /api (session) belum tercover — lihat script header.
`;
  const outPath = resolve(outDir, "api-schema.d.ts");
  writeFileSync(outPath, `${header}\n${astToString(ast)}`);
  console.log(`[codegen] ${outPath} ditulis (${docs.length} dokumen digabung)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
