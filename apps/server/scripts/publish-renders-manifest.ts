// Backfill manifest render publik (renders.json) dari semua job done yang
// opt-in publikasi (publishedToGallery=true). Jalankan setiap selesai deploy
// versi yang mengubah format manifest, atau untuk memperbarui galeri:
//
//   # server: bun hanya ada di dalam container — jalankan via compose:
//   docker compose --env-file .env.prod -f docker-compose.prod.yml \
//     exec app bun apps/server/scripts/publish-renders-manifest.ts
//
//   # lokal (repo root):
//   bun apps/server/scripts/publish-renders-manifest.ts
//
// Aman bila manifest sudah kosong/beberapa entry dihapus: rebuild idempoten
// (hanya job opt-in yang masuk; karya klien private tidak pernah ter-include).
// Setelah ini, manifest di-update otomatis oleh worker saat render selesai
// (publishRenderManifest di render-processor).

import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { config } from "dotenv";
import { rebuildRenderManifest } from "@sahabatkreator/queue";

// Load root .env hanya bila env container belum ada (local run). Path diambil
// relatif terhadap file ini — BUKAN cwd — agar tidak peduli dari mana dipanggil.
if (!process.env.R2_BUCKET) {
  config({
    path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  });
}

const result = await rebuildRenderManifest();

console.log(
  `Manifest render di-rebuild: ${result.published} entry opt-in (key: renders.json).`,
);
console.log(
  "Cek di URL publik R2 (VITE_RENDERS_MANIFEST_URL) — halaman /renders akan memuatnya.",
);
