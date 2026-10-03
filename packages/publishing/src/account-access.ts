// Penanda "akses platform hilang" — satu tempat, supaya jam retensi tidak pernah
// lupa dipasang saat sebuah akun ditandai butuh hubungkan ulang.
//
// MASALAH YANG DIPECAHKAN: sebelumnya `needsReconnect: true` ditulis di empat
// tempat berbeda (token-refresh ×2, analytics Pinterest, health-check bridge)
// tanpa jejak KAPAN akun itu mulai bermasalah. Tanpa jam mulai, job retensi
// tidak bisa tahu akun mana yang sudah terlantar melewati masa tenggang — dan
// `updated_at` tidak bisa dipakai karena kolom itu ikut berubah pada update apa
// pun. Akibatnya data akun yang tokennya dicabut tersimpan selamanya, padahal
// Meta/YouTube/LinkedIn/TikTok semuanya mewajibkan penghapusan.

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Tandai akun butuh hubungkan ulang DAN catat kapan aksesnya hilang.
 *
 * `accessLostAt` diisi SEKALI (`coalesce`) dan sengaja TIDAK pernah digeser saat
 * ditandai berulang: job retensi menghitung masa tenggang dari kejadian pertama.
 * Kalau setiap siklus sync menulis ulang waktunya, akun yang gagal terus tidak
 * akan pernah dibersihkan — persis bug yang ingin dihindari.
 *
 * @param lastError Pesan yang ditampilkan ke user. `undefined` = biarkan apa
 *   adanya (dipakai saat pemanggil tidak punya pesan baru).
 */
export async function markAccessLost(accountId: string, lastError?: string | null): Promise<void> {
  await db
    .update(socialAccount)
    .set({
      needsReconnect: true,
      accessLostAt: sql`coalesce(${socialAccount.accessLostAt}, now())`,
      ...(lastError === undefined ? {} : { lastError }),
    })
    .where(eq(socialAccount.id, accountId));
}

/**
 * Akses pulih (reconnect / refresh token berhasil) → hentikan jam retensi.
 *
 * Dipakai bersama patch lain milik pemanggil, karena tiap titik pemulihan juga
 * menulis token/expiry-nya sendiri:
 *
 * ```ts
 * await db.update(socialAccount).set({
 *   ...clearAccessLostPatch(),
 *   accessTokenEnc: encrypt(token.accessToken),
 * }).where(...)
 * ```
 */
export function clearAccessLostPatch(): { needsReconnect: false; accessLostAt: null } {
  return { needsReconnect: false, accessLostAt: null };
}
