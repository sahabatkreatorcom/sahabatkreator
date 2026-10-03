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
 * diperbarui" / "kuota API penuh") mencegah kebingungan yang sama terulang.
 */

/** Bagian metrik dari respons `/posts/sync`. */
export type SyncMetrics = {
  /**
   * done      — selesai
   * throttled — platform membatasi permintaan (kuota API habis); angka yang
   *             tampil belum lengkap dan siklus berikutnya pun akan gagal
   *             sampai kuota pulih
   * pending   — anggaran waktu server habis; sync lanjut di latar belakang dan
   *             angkanya muncul sendiri (halaman polling tiap 60s)
   * error     — gagal karena sebab lain; konten tetap tersimpan
   */
  status: "done" | "throttled" | "pending" | "error";
  /** Jumlah akun yang metriknya diproses. */
  accounts: number;
  /** Jumlah post yang angkanya baru ditarik dari platform. */
  posts: number;
  /** Jumlah akun yang dibatasi platform — hanya ada saat `status === "throttled"`. */
  throttled?: number;
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
 * (mis. semua post sudah punya angka segar). Status `error` dan `throttled`
 * ditangani pemanggil lewat `buildSyncToast` karena butuh nada peringatan.
 */
export function syncMetricsNote(metrics: SyncMetrics | undefined): string | null {
  if (!metrics) return null;
  if (metrics.status === "pending") return "metrik sedang disegarkan";
  if (metrics.status !== "done") return null;
  return metrics.posts > 0 ? `${metrics.posts} metrik post diperbarui` : null;
}

/** Toast siap pakai dari respons `/posts/sync`. */
export type SyncToast = {
  kind: "success" | "warning";
  message: string;
  description?: string;
};

/**
 * Susun pesan toast dari respons `/posts/sync`.
 *
 * `throttled` dibedakan dari `error`: bukan aplikasinya rusak, tapi kuota API
 * platform sedang habis. Pengguna perlu tahu bedanya supaya tidak menekan
 * tombol berulang-ulang (yang justru memperpanjang blokir menurut dokumentasi
 * Meta) dan tidak menyimpulkan sinkronisasinya gagal.
 */
export function buildSyncToast(res: SyncResponse): SyncToast {
  const content = syncContentNote(res.summary);
  const metrics = res.metrics;

  if (metrics?.status === "error") {
    return {
      kind: "warning",
      message: `${content} — metrik gagal disegarkan`,
      description: metrics.message,
    };
  }
  if (metrics?.status === "throttled") {
    return {
      kind: "warning",
      message: `${content} — kuota API platform penuh`,
      description:
        "Platform sedang membatasi permintaan, jadi sebagian metrik belum tersegarkan. Tunggu beberapa menit, lalu coba lagi — menekan berulang justru memperpanjang pembatasan.",
    };
  }

  const note = syncMetricsNote(metrics);
  return { kind: "success", message: note ? `${content} · ${note}` : content };
}
