// Batas body request: upload multipart dapat jatah besar, route lain kecil.
//
// Dokumentasi lengkap (semua layer: Cloudflare → NGINX → sini → route, cara
// mengubah limit, troubleshooting 413): deploy/upload-body-limits.md
//
// Kenapa tidak `bodyLimit` global + override per-route: middleware `/*` terlebih
// dulu jalan, jadi limit kecil global akan menolak upload 100MB SEBELUM limit
// besar route-level sempat dipakai. Karena itu pemilihan maxSize dilakukan dalam
// satu middleware `/*` berdasarkan path.
//
// Route clip/video/automation HANYA JSON — mereka reference media via id atau
// sourceUrl, jadi byte besar videonya lewat /api/media/upload (multipart, lihat
// LARGE_UPLOAD_PATHS). Lihat juga lib/body-limit.test.ts.

import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Upload media multipart: 100MB file + overhead form-data */
export const UPLOAD_MAX = 110 * 1024 * 1024;
/** JSON API — payload terbesar di repo (batch schedule, caption carousel) jauh di bawah ini */
export const JSON_MAX = 10 * 1024 * 1024;

/**
 * Path yang menerima multipart besar. Tambah di sini, BUKAN di index.ts, agar
 * test lib/body-limit.test.ts ikut memverifikasi daftarnya.
 */
export const LARGE_UPLOAD_PATHS = new Set<string>([
  "/api/media/upload",
  "/api/sound/upload",
  "/api/admin/holidays/import",
]);

/** Body limit yang sadar upload route — dipasang sekali di app.use("/*"). */
export const uploadAwareBodyLimit = (): MiddlewareHandler => async (c, next) =>
  bodyLimit({
    maxSize: LARGE_UPLOAD_PATHS.has(c.req.path) ? UPLOAD_MAX : JSON_MAX,
  })(c, next);
