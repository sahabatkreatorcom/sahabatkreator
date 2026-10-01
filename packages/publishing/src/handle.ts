// Normalisasi handle akun sosial sebelum disimpan ke DB.
//
// Konvensi: DB menyimpan handle TANPA awalan "@". UI (inbox, DM, listening,
// preview) yang menambahkan "@" saat render.
//
// Kalau DB menyimpan "@ngaretsantri" sementara UI menulis `@{authorUsername}`,
// yang muncul di layar jadi "@@ngaretsantri" — terlihat seperti bug saat
// screencast review.

/**
 * Buang awalan "@" (satu atau lebih) dan spasi di ujung.
 * Mengembalikan null bila hasilnya kosong, supaya tidak menyimpan string kosong.
 */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutAt = trimmed.replace(/^@+/, "").trim();
  return withoutAt || null;
}
