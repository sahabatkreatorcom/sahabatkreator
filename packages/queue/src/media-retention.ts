// Klasifikasi objek R2 untuk rekonsiliasi — MURNI, tanpa import SDK storage
// maupun DB, supaya bisa diuji tanpa kredensial (pola sama dengan `retention.ts`
// dan `rate-limits.ts`).
//
// MASALAH YANG DIPECAHKAN
// Satu prefix organisasi di R2 TIDAK hanya berisi file pustaka media. Isinya juga
// keluaran fitur lain:
//   {orgId}/{yyyy}/{mm}/{sk_media_xxx}.jpg      → pustaka media  (punya baris `media`)
//   {orgId}/{yyyy}/{mm}/render_{jobId}.mp4      → hasil render video
//   {orgId}/{yyyy}/{mm}/render_{jobId}.srt      → subtitle hasil render
//   {orgId}/{yyyy}/{mm}/clipper_{jobId}.srt     → subtitle auto-clip
//   {orgId}/{yyyy}/{mm}/carousel_{jobId}.pdf    → ekspor PDF carousel
//   {orgId}/{yyyy}/{mm}/carousel_{jobId}_*.jpg  → slide carousel
//   {orgId}/{yyyy}/{mm}/{stockId}.jpg           → media stok (Pixabay/Pexels)
// Jadi "tidak ada di tabel media" BUKAN berarti sampah — subtitle dan PDF memang
// tidak pernah muncul di tabel `media`. Job yang menghapus berdasarkan "tidak
// ketemu di DB" akan menghancurkan hasil render user.
//
// KARENA ITU: hanya objek yang basename-nya POLA ID PUSTAKA MEDIA yang boleh
// dihapus, dan hanya bila barisnya benar-benar hilang. Sisanya dilaporkan
// ("unknown") supaya bisa ditinjau manusia — tidak pernah dihapus otomatis.

/**
 * Masa tenggang sebelum objek yatim dihapus.
 *
 * Ini BUKAN angka kebijakan platform — file media adalah unggahan milik user,
 * bukan data platform, jadi batas 30 hari di `retention.ts` tidak berlaku di
 * sini. Angka ini semata-mata margin waktu supaya rekonsiliasi tidak berlomba
 * dengan upload yang sedang berjalan atau penghapusan yang sedang diulang.
 */
export const MEDIA_ORPHAN_GRACE_DAYS = 14;

/**
 * Basename objek pustaka media: `sk_media_<id>.<ext>`.
 *
 * ID dibuat `generateId("media")` di lib/r2.ts dan selalu jadi nama file, jadi
 * pola ini adalah cara paling andal membedakan file pustaka dari keluaran fitur
 * lain yang tinggal di folder yang sama.
 */
const MEDIA_LIBRARY_BASENAME_RE = /^sk_media_[0-9a-z]+\./;

/** Ambil basename dari sebuah key R2 (`a/b/c.jpg` → `c.jpg`). */
export function basenameOf(key: string): string {
  const idx = key.lastIndexOf("/");
  return idx >= 0 ? key.slice(idx + 1) : key;
}

/**
 * Prefix level teratas ini milik organisasi?
 *
 * Bucket TIDAK hanya berisi folder organisasi — ada juga namespace lain seperti
 * `dfm/`. Job ini HANYA boleh menyentuh folder organisasi; namespace lain
 * dilaporkan lalu dilewati. Karena itu dipakai aturan bentuk, bukan daftar nama:
 * id organisasi dibuat better-auth dengan panjang tetap dan hanya berisi
 * alfanumerik (mis. `Jtjrg5zR68T1OAQgo3rGWM4e4RwoNciT`), sedangkan `dfm`
 * terlalu pendek. Daftar nama akan basi; aturan bentuk tidak.
 *
 * Catatan: id organisasi yang SUDAH DIHAPUS tetap lolos aturan ini — justru itu
 * yang perlu ikut diperiksa.
 */
export function isOrganizationPrefix(prefix: string): boolean {
  const name = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (name.length < 16) return false;
  if (name.includes("/")) return false;
  return /^[A-Za-z0-9_-]+$/.test(name);
}

/** Objek ini file pustaka media? (bukan subtitle/PDF/output render) */
export function isMediaLibraryKey(key: string): boolean {
  return MEDIA_LIBRARY_BASENAME_RE.test(basenameOf(key));
}

/**
 * Putusan untuk satu objek:
 * - `known`   — key-nya tercatat di DB. Jangan disentuh.
 * - `held`    — yatim, tapi masih di dalam masa tenggang. Tahan dulu.
 * - `orphan`  — yatim dan sudah lewat masa tenggang → boleh dihapus.
 * - `unknown` — bukan file pustaka media (subtitle/PDF/output/…), ATAU waktu
 *               objek tidak diketahui. Dilaporkan saja, TIDAK PERNAH dihapus.
 */
export type MediaObjectVerdict = "known" | "held" | "orphan" | "unknown";

export function classifyMediaObject(
  object: { key: string; lastModified: Date | null },
  knownKeys: ReadonlySet<string>,
  now: Date,
  graceDays: number = MEDIA_ORPHAN_GRACE_DAYS,
): MediaObjectVerdict {
  if (knownKeys.has(object.key)) return "known";
  // Bukan file pustaka media → di luar tanggung jawab job ini.
  if (!isMediaLibraryKey(object.key)) return "unknown";
  // Tanpa waktu objek kita tidak bisa membuktikan sudah lewat masa tenggang —
  // jangan menebak, cukup laporkan.
  if (!object.lastModified) return "unknown";
  const cutoff = now.getTime() - graceDays * 24 * 60 * 60 * 1000;
  return object.lastModified.getTime() > cutoff ? "held" : "orphan";
}
