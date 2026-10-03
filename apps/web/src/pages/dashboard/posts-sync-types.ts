/**
 * Tipe + penyusun pesan untuk `POST /posts/sync`.
 *
 * Dipakai DUA halaman yang sama-sama punya tombol "Sinkron Platform"
 * (Hasil Post dan Kalender), jadi bentuk respons dan kalimat laporannya
 * tinggal di satu tempat.
 *
 * MENGAPA metrik dilaporkan terpisah: server mengimpor KONTEN lalu menyegarkan
 * METRIK dalam request yang sama. Sebelumnya tombol ini hanya mengimpor konten,
 * sehingga setelah reconnect akun semua angka tetap 0 dan tombolnya terlihat
 * tidak bekerja. Pesan yang jujur ("metrik sedang disegarkan" / "N metrik post
 * diperbarui") mencegah kebingungan yang sama terulang.
 */

/** Bagian metrik dari respons `/posts/sync`. */
export type SyncMetrics = {
  /**
   * done    — selesai
   * pending — anggaran waktu server habis; sync lanjut di latar belakang dan
   *           angkanya muncul sendiri (halaman polling tiap 60s)
   * error   — gagal disegarkan; konten tetap tersimpan
   */
  status: "done" | "pending" | "error";
  /** Jumlah akun yang metriknya diproses. */
  accounts: number;
  /** Jumlah post yang angkanya baru ditarik dari platform. */
  posts: number;
  /** Detail kegagalan — hanya ada saat `status === "error"`. */
  message?: string;
};

export type SyncSummary = {
  totalPostsImported: number;
  totalPostsUpdated: number;
};

export type SyncResponse = {
  summary: SyncSummary;
  metrics: SyncMetrics;
};

/**
 * Pesan hasil impor konten.
 *
 * `imported` = post baru; `updated` = post lama yang konten/media-nya
 * disegarkan. Keduanya hasil nyata — jangan bilang "sudah terbaru" kalau
 * sebenarnya ada puluhan baris yang baru saja diperbarui.
 */
export function syncContentNote(summary: SyncSummary | undefined): string {
  const imported = summary?.totalPostsImported ?? 0;
  const updated = summary?.totalPostsUpdated ?? 0;
  if (imported > 0) {
    return updated > 0
      ? `${imported} konten baru diimpor, ${updated} konten diperbarui`
      : `${imported} konten platform berhasil diimpor`;
  }
  if (updated > 0) return `${updated} konten platform diperbarui`;
  return "Konten platform sudah terbaru";
}

/**
 * Pesan hasil penyegaran metrik — `null` bila tidak ada yang perlu dilaporkan
 * (mis. semua post sudah punya angka segar, atau statusnya `error` yang
 * ditangani pemanggil dengan toast peringatan tersendiri).
 */
export function syncMetricsNote(metrics: SyncMetrics | undefined): string | null {
  if (!metrics) return null;
  if (metrics.status === "pending") return "metrik sedang disegarkan";
  if (metrics.status === "error") return null;
  return metrics.posts > 0 ? `${metrics.posts} metrik post diperbarui` : null;
}
