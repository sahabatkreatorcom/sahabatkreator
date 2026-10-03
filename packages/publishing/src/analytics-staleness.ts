// Aturan "snapshot metrik hari ini masih segar?" — MURNI, tanpa import DB,
// supaya bisa diuji tanpa database (pola sama dengan `rate-limits.ts`).
//
// Ini aturan yang menentukan berapa panggilan API yang kita BUANG, jadi salah di
// sini langsung terasa sebagai bug mahal di dua arah:
// - terlalu longgar → metrik tersangkut 0 seharian (keluhan "sudah tekan Sinkron
//   tapi tetap 0 semua"), padahal datanya sudah ada di platform;
// - terlalu ketat   → kuota Meta terbuang menembak ulang post yang metriknya
//   tidak berubah, dan kuota app-wide itu cuma `200 × daily active user`/jam.

/**
 * Snapshot ber-metrik-nol ditahan selama ini di jalur OTOMATIS (worker, tiap
 * jam). Di sana jendela panjang benar: post yang metriknya memang belum ada
 * tidak akan berubah dalam 5 menit, jadi menembaknya ulang hanya membuang kuota.
 */
export const STALE_AFTER_MINUTES = 45;

/**
 * Jendela pendek untuk jalur MANUAL (tombol "Sinkron Platform").
 *
 * Pengguna menekan tombol justru KARENA angkanya masih 0 — menolak retry selama
 * 45 menit membuat tombolnya terasa rusak. Dua menit cukup untuk mencegah
 * penekanan beruntun melipatgandakan panggilan API, tapi cukup cepat untuk
 * memperbaiki hari yang metriknya belum terisi.
 */
export const MANUAL_EMPTY_RETRY_MINUTES = 2;

/** Kolom metrik yang dinilai (bentuk baris `post_analytics` hari ini). */
export type PostAnalyticsSnapshot = {
  updatedAt: Date | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  views: number | null;
  impressions: number | null;
  reach: number | null;
};

/**
 * Snapshot sudah memuat interaksi nyata? Satu metrik saja cukup.
 *
 * MENGAPA penting: baris ber-interaksi TIDAK PERNAH diambil ulang di hari yang
 * sama, apa pun jalurnya (worker maupun manual). Inilah pengaman kuota yang
 * tidak boleh dilonggarkan — tanpa ini, tiap penekanan tombol menembak 25 post.
 */
export function hasEngagement(row: PostAnalyticsSnapshot): boolean {
  return (
    (row.likes ?? 0) > 0 ||
    (row.comments ?? 0) > 0 ||
    (row.shares ?? 0) > 0 ||
    (row.saves ?? 0) > 0 ||
    (row.views ?? 0) > 0 ||
    (row.impressions ?? 0) > 0 ||
    (row.reach ?? 0) > 0
  );
}

/**
 * Snapshot hari ini dianggap SUDAH sinkron (→ dilewati) atau belum.
 *
 * - Ada interaksi nyata → selalu "sudah sinkron" (tidak pernah diulang).
 * - Semua metrik nol → "belum sinkron" bila umurnya sudah melewati
 *   `emptyRetryAfterMinutes`; masih lebih muda dari itu → ditahan.
 * - `updatedAt` null (data lama / baris tak lengkap) → dianggap belum sinkron.
 */
export function isSnapshotFresh(
  row: PostAnalyticsSnapshot,
  now: Date,
  emptyRetryAfterMinutes: number,
): boolean {
  if (hasEngagement(row)) return true;
  if (!row.updatedAt) return false;
  const cutoff = now.getTime() - emptyRetryAfterMinutes * 60_000;
  return row.updatedAt.getTime() > cutoff;
}
