import { describe, expect, it } from "vitest";
import { metricValue, supportedPostMetrics } from "./analytics-metrics";

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

  it("gabungan akun: metrik dianggap ada bila SALAH SATU platform menyediakannya", () => {
    // IG menyediakan impressions → kartu tetap tampil saat filter "semua akun"
    const s = supportedPostMetrics(["threads", "instagram"]);
    expect(s.impressions).toBe(true);
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
