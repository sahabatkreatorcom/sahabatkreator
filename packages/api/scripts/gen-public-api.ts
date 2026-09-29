// Generator untuk artifacts OpenAPI yang di-commit ke repo.
//
// Mengapa commit: `verify-openapi.ts` membandungkan dokumen yang di-regenerate
// dengan versi committed — drift terdeteksi di CI sebelum endpoint live
// berubah tanpa sepengetahuan tim. File committed JUGA dipakai oleh client
// codegen (apps/web `bun run codegen:openapi`) tanpa perlu server jalan.
//
// Jalankan setelah schema / path /v1 berubah:
//   bun scripts/gen-public-api.ts
// lalu commit perubahan scripts/public-api.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOpenApiDocument, createPublicApiDocument } from "../src/index";

const apiDir = import.meta.dirname;

function writeJson(path: string, doc: unknown) {
  mkdirSync(apiDir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`[openapi] ${path} ditulis`);
}

writeJson(join(apiDir, "..", "src", "openapi.json"), createOpenApiDocument());
writeJson(join(apiDir, "public-api.json"), createPublicApiDocument());
console.log("[openapi] selesai — commit perubahan artifact (drift guard CI)");
