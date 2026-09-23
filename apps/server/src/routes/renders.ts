// Galeri /renders — manifest dibangun dari DB (hanya job opt-in publikasi).
//
// Sebelumnya manifest di-serving sebagai file renders.json publik di R2
// (media.sahabatkreator.com/renders.json) — anonim bisa baca + download semua
// karya klien. Halaman /renders sendiri ada di dalam RequireAuth, jadi
// manifest ini cukup di-serving melalui API terauthentikasi. Lihat RFC dan
// commit fix kebocoran galeri untuk alasan membuang file publik.
import { getRenderManifest } from "@sahabatkreator/queue";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../lib/auth-guard";

export const rendersRoute = new Hono();

/**
 * GET /renders/manifest — daftar render yang sudah opt-in publikasi.
 * requireOrg: hanya user login + anggota org yang bisa lihat galeri.
 */
rendersRoute.get("/manifest", async (c) => {
  try {
    await requireOrg(c);
    const manifest = await getRenderManifest();
    return c.json(manifest);
  } catch (error) {
    return errorResponse(error);
  }
});
