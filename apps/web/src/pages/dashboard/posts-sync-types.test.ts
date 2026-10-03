import { describe, expect, it } from "vitest";
import {
  buildSyncToast,
  type SyncMetrics,
  type SyncResponse,
  syncContentNote,
  syncMetricsNote,
} from "./posts-sync-types";

function res(
  metrics: Partial<SyncMetrics>,
  summary?: Partial<SyncResponse["summary"]>,
): SyncResponse {
  return {
    summary: { totalPostsImported: 0, totalPostsUpdated: 0, ...summary },
    metrics: { status: "done", accounts: 1, posts: 0, ...metrics },
  };
}

describe("syncContentNote", () => {
  it("melaporkan konten baru dan yang diperbarui", () => {
    expect(syncContentNote({ totalPostsImported: 3, totalPostsUpdated: 5 })).toBe(
      "3 konten baru diimpor, 5 konten diperbarui",
    );
  });

  it("hanya konten baru", () => {
    expect(syncContentNote({ totalPostsImported: 4, totalPostsUpdated: 0 })).toBe(
      "4 konten platform berhasil diimpor",
    );
  });

  it("hanya pembaruan", () => {
    expect(syncContentNote({ totalPostsImported: 0, totalPostsUpdated: 7 })).toBe(
      "7 konten platform diperbarui",
    );
  });

  it("tidak ada perubahan", () => {
    expect(syncContentNote({ totalPostsImported: 0, totalPostsUpdated: 0 })).toBe(
      "Konten platform sudah terbaru",
    );
  });

  it("summary hilang tidak melempar", () => {
    expect(syncContentNote(undefined)).toBe("Konten platform sudah terbaru");
  });
});

describe("syncMetricsNote", () => {
  it("done + ada post → jumlah metrik", () => {
    expect(syncMetricsNote({ status: "done", accounts: 1, posts: 22 })).toBe(
      "22 metrik post diperbarui",
    );
  });

  it("done tanpa post → tidak ada yang dilaporkan", () => {
    expect(syncMetricsNote({ status: "done", accounts: 1, posts: 0 })).toBeNull();
  });

  it("pending → metrik sedang disegarkan", () => {
    expect(syncMetricsNote({ status: "pending", accounts: 0, posts: 0 })).toBe(
      "metrik sedang disegarkan",
    );
  });

  it("throttled & error ditangani buildSyncToast, bukan di sini", () => {
    expect(syncMetricsNote({ status: "throttled", accounts: 1, posts: 0 })).toBeNull();
    expect(syncMetricsNote({ status: "error", accounts: 0, posts: 0 })).toBeNull();
  });
});

describe("buildSyncToast", () => {
  it("sukses: konten + metrik dalam satu kalimat", () => {
    const t = buildSyncToast(
      res({ status: "done", posts: 12 }, { totalPostsImported: 2, totalPostsUpdated: 0 }),
    );
    expect(t.kind).toBe("success");
    expect(t.message).toBe("2 konten platform berhasil diimpor · 12 metrik post diperbarui");
  });

  it("kuota API penuh → peringatan, BUKAN sukses", () => {
    const t = buildSyncToast(res({ status: "throttled", throttled: 2, posts: 5 }));
    expect(t.kind).toBe("warning");
    expect(t.message).toContain("kuota API platform penuh");
    // Pesan harus menahan pengguna dari menekan tombol berulang kali.
    expect(t.description).toContain("memperpanjang");
  });

  it("gagal → peringatan dengan detail penyebab", () => {
    const t = buildSyncToast(res({ status: "error", message: "network_error" }));
    expect(t.kind).toBe("warning");
    expect(t.message).toContain("metrik gagal disegarkan");
    expect(t.description).toBe("network_error");
  });

  it("pending tetap sukses (angka menyusul sendiri)", () => {
    const t = buildSyncToast(res({ status: "pending" }));
    expect(t.kind).toBe("success");
    expect(t.message).toContain("metrik sedang disegarkan");
  });
});
