// Retensi data platform — MURNI, tanpa import DB (pola sama dengan
// `rate-limits.ts` dan `analytics-staleness.ts`), supaya bisa diuji tanpa database.
//
// MENGAPA MODUL INI ADA
// Setiap platform mewajibkan kita MENGHAPUS data yang kita simpan dari API mereka
// begitu tujuan sahnya hilang. Sebelum ini aplikasi tidak punya mekanisme apa pun:
// satu-satunya jalan menghapus data adalah tombol Disconnect yang ditekan user.
// Akun yang tokennya dicabut/ditolak tetap menyimpan seluruh data selamanya —
// itu pelanggaran, bukan sekadar utang teknis.
//
// DASAR PER PLATFORM (dicek ke dokumen resmi, 3 Okt 2026):
// - YouTube Developer Policies III.E.4.c/d — data boleh disimpan maksimal
//   **30 hari kalender**, setelah itu wajib dihapus ATAU disegarkan.
//   III.E.4.b — statistik (views, subscriber) boleh >30 hari TAPI wajib
//   diverifikasi ulang otorisasinya setiap 30 hari. III.D.2.c.1 & III.E.4.g —
//   setelah user mencabut izin / minta hapus, batasnya **7 hari**.
// - Meta Platform Terms §3.d.i.2.d — hapus "as soon as reasonably possible"
//   begitu user minta atau **tidak lagi punya akun** di layanan kita;
//   §3.d.i.2.a — hapus ketika retensi "no longer necessary for a legitimate
//   business purpose". Tidak ada angka hari, jadi kita memakai jendela berbatas.
// - LinkedIn API Terms §4.1 — simpan hanya "for the duration necessary to
//   provide your Application's services"; §4.4 — hapus **segera** saat user
//   minta atau akunnya ditutup.
// - TikTok Developer Terms §VI — saat termination, hapus "immediately".
// - Pinterest Developer Guidelines — defaultnya DILARANG menyimpan; kita tidak
//   menyimpan apa pun dari Pinterest, jadi tidak relevan di sini.
// - Bluesky/AT Protocol — data publik, tidak ada batas retensi.
//
// ANGKA YANG DIPAKAI: 30 hari. YouTube adalah yang paling ketat dan menyebut
// angka eksplisit, jadi 30 hari adalah jendela yang aman untuk SEMUA platform —
// cukup berbatas untuk memenuhi "as soon as reasonably possible" Meta dan
// "no longer than necessary" TikTok/LinkedIn, sekaligus tidak menghapus data
// yang masih wajar ditahan. Kalau nanti ada platform yang menuntut lebih ketat,
// ubah di sini — satu tempat, dipakai semua jalur.

/**
 * Berapa lama data akun yang AKSESNYA HILANG masih boleh disimpan sebelum
 * dihapus. Dihitung dari saat akses terbukti hilang (`social_account.access_lost_at`).
 *
 * AKSES HILANG ≠ USER MENGHAPUS. Ini untuk kasus token dicabut di sisi platform,
 * refresh gagal, atau akun di-suspend — kondisi yang sudah ditandai
 * `needs_reconnect`. Kalau user sendiri menekan Disconnect, data dihapus saat itu
 * juga (jalur terpisah), jadi tidak menunggu 30 hari.
 */
export const ACCESS_LOST_RETENTION_DAYS = 30;

/** Kondisi akun yang relevan untuk penilaian retensi. */
export type RetentionCandidate = {
  id: string;
  platform: string;
  username: string | null;
  /** Kapan akses terbukti hilang (null bila belum pernah ditandai). */
  accessLostAt: Date | null;
  /** `social_account.updated_at` — hanya dipakai sebagai cadangan untuk baris lama. */
  updatedAt: Date;
  needsReconnect: boolean;
  isConnected: boolean;
};

/**
 * Akses akun ini sedang hilang? Dipakai untuk memutuskan apakah jam retensi
 * relevan sama sekali.
 *
 * `is_connected = false` ikut dihitung supaya job ini tetap bekerja setelah
 * fitur "putuskan sambungan (simpan data)" ada — tanpa perlu mengubah dua tempat.
 */
export function isAccessLost(account: Pick<RetentionCandidate, "needsReconnect" | "isConnected">) {
  return account.needsReconnect || !account.isConnected;
}

/**
 * Kapan jam retensi akun ini mulai berjalan, atau `null` bila tidak relevan.
 *
 * `accessLostAt` adalah sumber utama. Cadangan ke `updatedAt` HANYA untuk baris
 * yang ditandai `needs_reconnect` sebelum kolom `access_lost_at` ada — tanpa
 * cadangan itu, akun bermasalah yang sudah lama terlantar tidak akan pernah
 * dibersihkan. `updatedAt` sengaja TIDAK dipakai untuk baris baru karena kolom
 * itu ikut berubah pada update apa pun (mis. `last_synced_at`), sehingga jam
 * retensi bisa mundur tanpa sengaja.
 */
export function resolveAccessLostAt(account: RetentionCandidate): Date | null {
  if (!isAccessLost(account)) return null;
  return account.accessLostAt ?? account.updatedAt;
}

/** Batas waktu penghapusan untuk sebuah jam mulai retensi. */
export function retentionDeadline(accessLostAt: Date, days = ACCESS_LOST_RETENTION_DAYS): Date {
  return new Date(accessLostAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Sudah waktunya data akun ini dihapus?
 *
 * Akun yang aksesnya masih sehat SELALU `false` — data akun aktif tidak pernah
 * disentuh job ini, apa pun umurnya (retensi berlaku untuk data akun yang tidak
 * bisa lagi kita jaga kesegarannya, bukan untuk pelanggan aktif).
 */
export function isRetentionExpired(
  account: RetentionCandidate,
  now: Date,
  days = ACCESS_LOST_RETENTION_DAYS,
): boolean {
  const since = resolveAccessLostAt(account);
  if (!since) return false;
  return now.getTime() >= retentionDeadline(since, days).getTime();
}
