import { describe, expect, it } from "vitest";
import {
  hasEngagement,
  isSnapshotFresh,
  MANUAL_EMPTY_RETRY_MINUTES,
  type PostAnalyticsSnapshot,
  STALE_AFTER_MINUTES,
} from "./analytics-staleness";

const NOW = new Date("2026-10-03T07:00:00.000Z");

/** Baris post_analytics hari ini, semua metrik nol (kasus paling rawan). */
const emptyRow = (updatedAt: Date | null): PostAnalyticsSnapshot => ({
  updatedAt,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  views: 0,
  impressions: 0,
  reach: 0,
});

const minutesAgo = (minutes: number): Date => new Date(NOW.getTime() - minutes * 60_000);

describe("hasEngagement", () => {
  it("false bila semua metrik nol", () => {
    expect(hasEngagement(emptyRow(NOW))).toBe(false);
  });

  it("true bila ada SATU metrik saja yang positif", () => {
    for (const key of [
      "likes",
      "comments",
      "shares",
      "saves",
      "views",
      "impressions",
      "reach",
    ] as const) {
      expect(hasEngagement({ ...emptyRow(NOW), [key]: 1 })).toBe(true);
    }
  });

  it("memperlakukan null sebagai nol", () => {
    expect(hasEngagement({ ...emptyRow(NOW), likes: null, views: null })).toBe(false);
  });
});

describe("isSnapshotFresh — baris ber-interaksi", () => {
  it("selalu segar (dilewati) walau snapshot sudah lama", () => {
    const row = { ...emptyRow(minutesAgo(600)), likes: 3 };
    expect(isSnapshotFresh(row, NOW, STALE_AFTER_MINUTES)).toBe(true);
    expect(isSnapshotFresh(row, NOW, MANUAL_EMPTY_RETRY_MINUTES)).toBe(true);
  });
});

describe("isSnapshotFresh — baris semua nol", () => {
  it("jalur worker menahan snapshot yang masih muda", () => {
    expect(isSnapshotFresh(emptyRow(minutesAgo(1)), NOW, STALE_AFTER_MINUTES)).toBe(true);
  });

  it("jalur worker mengulang setelah jendela 45 menit lewat", () => {
    expect(isSnapshotFresh(emptyRow(minutesAgo(46)), NOW, STALE_AFTER_MINUTES)).toBe(false);
  });

  it("jalur manual sudah boleh mengulang setelah 2 menit", () => {
    // Inilah pelonggaran yang diminta: baris yang SAMA, worker masih menahan,
    // tapi tombol "Sinkron Platform" sudah boleh memperbaikinya.
    const row = emptyRow(minutesAgo(3));
    expect(isSnapshotFresh(row, NOW, STALE_AFTER_MINUTES)).toBe(true);
    expect(isSnapshotFresh(row, NOW, MANUAL_EMPTY_RETRY_MINUTES)).toBe(false);
  });

  it("jalur manual masih menahan snapshot yang baru saja diambil (anti spam tombol)", () => {
    expect(isSnapshotFresh(emptyRow(minutesAgo(1)), NOW, MANUAL_EMPTY_RETRY_MINUTES)).toBe(true);
  });

  it("jendela 0 (trigger operator) langsung boleh mengulang", () => {
    expect(isSnapshotFresh(emptyRow(NOW), NOW, 0)).toBe(false);
  });

  it("updatedAt null dianggap belum sinkron", () => {
    expect(isSnapshotFresh(emptyRow(null), NOW, STALE_AFTER_MINUTES)).toBe(false);
    expect(isSnapshotFresh(emptyRow(null), NOW, MANUAL_EMPTY_RETRY_MINUTES)).toBe(false);
  });

  it("batas jendela bersifat eksklusif (tepat di batas → diulang)", () => {
    expect(isSnapshotFresh(emptyRow(minutesAgo(2)), NOW, 2)).toBe(false);
    expect(isSnapshotFresh(emptyRow(minutesAgo(1.9)), NOW, 2)).toBe(true);
  });
});

describe("konstanta jendela", () => {
  it("jalur manual lebih longgar daripada worker", () => {
    expect(MANUAL_EMPTY_RETRY_MINUTES).toBeLessThan(STALE_AFTER_MINUTES);
  });
});
