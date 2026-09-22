// Backfill manifest render publik (renders.json) dari semua job yang sudah done.
//
// Jalankan satu kali setelah deploy versi yang publish manifest aktif, agar
// render yang selesai sebelum fitur ini muncul di halaman /renders:
//
//   bun apps/server/scripts/publish-renders-manifest.ts
//
// Setelah itu, manifest di-update otomatis oleh worker setiap kali render
// selesai (publishRenderManifest di render-processor). Env di-load dari root .env.

import { resolve } from "node:path";
import { config } from "dotenv";
import { rebuildRenderManifest } from "@sahabatkreator/queue";

config({ path: resolve(process.cwd(), "../../.env") });

const result = await rebuildRenderManifest();

console.log(
  `Manifest render di-publish: ${result.published} entry (key: renders.json).`,
);
console.log(
  "Cek di URL publik R2 (VITE_RENDERS_MANIFEST_URL) — halaman /renders akan memuatnya.",
);
