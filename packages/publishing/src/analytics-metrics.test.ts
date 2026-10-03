import { describe, expect, it } from "vitest";
import { IG_MEDIA_METRIC_LISTS, metricValue, supportedPostMetrics } from "./analytics-metrics";

describe("supportedPostMetrics", () => {
  it("Threads: tanpa impressions, tapi ada views/likes/comments/shares", () => {
    const s = supportedPostMetrics(["threads"]);
    expect(s.impressions).toBe(false);
    expect(s.views).toBe(true);
    expect(s.likes).toBe(true);
    expect(s.comments).toBe(true);
    expect(s.shares).toBe(true);
  });

  it("YouTube: tanpa shares dan impressions", () => {
    const s = supportedPostMetrics(["youtube"]);
    expect(s.shares).toBe(false);
    expect(s.impressions).toBe(false);
    expect(s.views).toBe(true);
  });

  it("Bluesky: tanpa views dan impressions", () => {
    const s = supportedPostMetrics(["bluesky"]);
    expect(s.views).toBe(false);
    expect(s.impressions).toBe(false);
    expect(s.shares).toBe(true);
  });

  it("Instagram: TANPA impressions — platform tidak melaporkannya per-post", () => {
    // `impressions` per-post ditolak API untuk media setelah 2 Juli 2024.
    // Sebelumnya dipalsukan dari `views`, yang menyesatkan: angkanya identik
    // dengan views padahal platform tidak menyediakannya. Sekarang kartunya
    // menampilkan "tidak diseddikan platform" seperti Threads.
    for (const p of ["instagram", "instagram_standalone"]) {
      const s = supportedPostMetrics([p]);
      expect(s.impressions, `${p} tidak punya impressions`).toBe(false);
      expect(s.views).toBe(true);
      expect(s.likes).toBe(true);
      expect(s.comments).toBe(true);
      expect(s.shares).toBe(true);
    }
  });

  it("gabungan akun: metrik dianggap ada bila SALAH SATU platform menyediakannya", () => {
    // Facebook (Page Insights level akun) menyediakan impressions → kartu tetap
    // tampil saat filter "semua akun" walau Threads & IG tidak menyediakannya.
    const s = supportedPostMetrics(["threads", "instagram", "facebook"]);
    expect(s.impressions).toBe(true);
  });

  it("gabungan Threads + IG tanpa Facebook: impressions TIDAK tersedia", () => {
    const s = supportedPostMetrics(["threads", "instagram_standalone"]);
    expect(s.impressions).toBe(false);
    expect(s.views).toBe(true);
  });

  it("tanpa akun terhubung: semua metrik dianggap tersedia (jangan sembunyikan data)", () => {
    const s = supportedPostMetrics([]);
    expect(Object.values(s).every(Boolean)).toBe(true);
  });

  it("platform tak dikenal: semua metrik dianggap tersedia", () => {
    const s = supportedPostMetrics(["platform_baru"]);
    expect(Object.values(s).every(Boolean)).toBe(true);
  });
});

describe("metricValue", () => {
  it("mengambil values[0].value", () => {
    expect(metricValue([{ name: "views", values: [{ value: 301 }] }], "views")).toBe(301);
  });

  it("mengambil total_value.value bila values tidak ada", () => {
    expect(metricValue([{ name: "likes", total_value: { value: 12 } }], "likes")).toBe(12);
  });

  it("null bila metrik tidak ada di response", () => {
    expect(metricValue([{ name: "views", values: [{ value: 1 }] }], "replies")).toBeNull();
  });
});

// Regresi: views IG pernah dihapus dari daftar metric dengan asumsi "tidak valid
// untuk reel" — asumsi itu salah, dan selama itu kartu Views IG selalu 0.
describe("IG_MEDIA_METRIC_LISTS — views wajib diminta", () => {
  it("instagram (FB login) meminta views", () => {
    const list = IG_MEDIA_METRIC_LISTS.instagram.split(",");
    expect(list).toContain("views");
    // impressions DITOLAK untuk media setelah 2 Jul 2024 dan membatalkan seluruh
    // request — tidak boleh masuk daftar.
    expect(list).not.toContain("impressions");
  });

  it("instagram_standalone (IG login) meminta views", () => {
    const list = IG_MEDIA_METRIC_LISTS.instagram_standalone.split(",");
    expect(list).toContain("views");
    expect(list).not.toContain("impressions");
  });

  it("metric inti (reach/likes/comments/shares) ada di kedua host", () => {
    for (const key of Object.keys(IG_MEDIA_METRIC_LISTS) as Array<
      keyof typeof IG_MEDIA_METRIC_LISTS
    >) {
      const list = IG_MEDIA_METRIC_LISTS[key].split(",");
      for (const core of ["reach", "likes", "comments", "shares"]) {
        expect(list, `${key} harus meminta ${core}`).toContain(core);
      }
    }
  });

  it("tidak memakai `saves` (plural) — ditolak HTTP 400 di kedua host", () => {
    for (const key of Object.keys(IG_MEDIA_METRIC_LISTS) as Array<
      keyof typeof IG_MEDIA_METRIC_LISTS
    >) {
      expect(IG_MEDIA_METRIC_LISTS[key].split(",")).not.toContain("saves");
    }
  });
});
