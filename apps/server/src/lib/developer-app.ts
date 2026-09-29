// Resolusi `developer_app` + validasi allowlist redirect — gerbang anti
// open-redirect untuk jalur API connect akun (docs/rfc-oauth-connect.md §7).
//
// MENGAPA file terpisah, bukan di dalam route: aturan keamanannya harus bisa
// diuji tanpa HTTP, dan dipakai oleh dua peran berbeda — `authorize` memvalidasi
// `?redirect=` SEBELUM state ditulis, sementara fase 3+ (`connect`/`exchange`)
// memakai app yang sama untuk audit & isolasi org.

import { db } from "@sahabatkreator/db";
import { developerApp } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { HTTPError } from "./auth-guard";

export type DeveloperApp = {
  id: string;
  name: string;
  allowedRedirectUris: string[];
};

/**
 * Ambil app aktif milik org ini. `null` bila tidak ada / non-aktif / bukan milik org.
 *
 * MENGAPA org ikut jadi kondisi query, bukan dicek setelahnya: key org A tidak
 * boleh memakai app milik org B. Kalau hanya `id` yang dicocokkan, app org lain
 * bisa dipakai sebagai sumber allowlist redirect — cukup tahu ID-nya.
 */
export async function resolveDeveloperApp(
  appId: string | null,
  organizationId: string,
): Promise<DeveloperApp | null> {
  if (!appId) return null;
  const [row] = await db
    .select({
      id: developerApp.id,
      name: developerApp.name,
      allowedRedirectUris: developerApp.allowedRedirectUris,
    })
    .from(developerApp)
    .where(
      and(
        eq(developerApp.id, appId),
        eq(developerApp.organizationId, organizationId),
        eq(developerApp.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Host loopback — lihat catatan skema di bawah. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Skema yang diterima.
 *
 * RFC §7 menulis "allowlist skema https saja"; `http` di sini ikut diterima
 * HANYA untuk host loopback, karena developer perlu menguji callback di mesin
 * sendiri tanpa tunnel. Ini tidak memperlemah jaminan utamanya: allowlist tetap
 * dicocokkan PERSIS, jadi URI harus sudah didaftarkan admin org — penyerang
 * tidak punya cara menyuntikkan tujuan. Yang benar-benar ditutup di sini adalah
 * skema yang DIEKSEKUSI browser (`javascript:`, `data:`, `file:`).
 */
function isAllowedScheme(url: URL): boolean {
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Validasi BENTUK sebuah redirect URI: absolut, skema diizinkan, tanpa fragment.
 * Melempar HTTPError(400) bila tidak sah. Tidak memeriksa keanggotaan allowlist.
 *
 * MENGAPA dipisah dari `assertAllowedRedirect`: aturan bentuk ini dipakai DUA
 * peran yang wajib sepakat — pemeriksaan saat request masuk (`assertAllowedRedirect`)
 * dan pendaftaran allowlist (`POST /api/developer-apps`, fase 4). Kalau keduanya
 * punya validator sendiri, allowlist bisa berisi URI yang selalu ditolak saat
 * dipakai: developer mendaftar dengan sukses, lalu setiap `authorize` gagal
 * dengan pesan yang tidak menjelaskan sebabnya.
 */
export function validateRedirectUri(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HTTPError(400, "Redirect URI bukan URL absolut yang valid.");
  }
  if (!isAllowedScheme(url)) {
    throw new HTTPError(400, "Redirect URI harus memakai https (http hanya untuk localhost).");
  }
  // Fragment akan MENELAN `?code=…&state=…` yang kita tambahkan di callback —
  // browser tidak pernah mengirimkannya ke server tujuan.
  if (url.hash) {
    throw new HTTPError(400, "Redirect URI tidak boleh mengandung fragment (#).");
  }
  return raw;
}

/**
 * Validasi `redirect` terhadap allowlist app; kembalikan URI apa adanya bila sah.
 *
 * Pencocokan PERSIS string — tanpa wildcard, tanpa prefix match: entri
 * `https://app.dev` sebagai prefix akan meloloskan `https://app.dev.evil.com`.
 * Perbandingan dilakukan pada string mentah (bukan hasil normalisasi URL) supaya
 * bentuk yang tidak biasa (`https://app.dev:443/cb`, huruf besar) tetap ditolak,
 * bukan diam-diam disetarakan.
 */
export function assertAllowedRedirect(app: DeveloperApp, raw: string): string {
  validateRedirectUri(raw);
  if (!app.allowedRedirectUris.includes(raw)) {
    throw new HTTPError(
      400,
      "Parameter redirect tidak terdaftar di allowlist app. Daftarkan URI-nya lebih dulu.",
    );
  }
  return raw;
}

/**
 * Tambahkan parameter ke URI tujuan akhir.
 *
 * MENGAPA tidak `${redirectUri}?code=…` seperti draf RFC §5.3: URI tujuan boleh
 * sudah punya query (`?lang=id`), dan konkatenasi buta menghasilkan
 * `…?lang=id?code=…` — URL rusak dan developer tidak pernah menerima code.
 * URL API sekaligus meng-encode nilainya, jadi `state` tidak di-escape manual.
 */
export function buildRedirectUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
