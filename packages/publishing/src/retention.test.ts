import { describe, expect, it } from "vitest";
import {
  ACCESS_LOST_RETENTION_DAYS,
  isAccessLost,
  isRetentionExpired,
  type RetentionCandidate,
  resolveAccessLostAt,
  retentionDeadline,
} from "./retention";

const NOW = new Date("2026-10-03T07:00:00.000Z");
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const account = (over: Partial<RetentionCandidate> = {}): RetentionCandidate => ({
  id: "sk_socacc_test",
  platform: "instagram",
  username: "contoh",
  accessLostAt: null,
  updatedAt: NOW,
  needsReconnect: false,
  isConnected: true,
  ...over,
});

describe("isAccessLost", () => {
  it("false untuk akun sehat", () => {
    expect(isAccessLost(account())).toBe(false);
  });

  it("true bila needsReconnect", () => {
    expect(isAccessLost(account({ needsReconnect: true }))).toBe(true);
  });

  it("true bila koneksi dimatikan (soft-disconnect)", () => {
    expect(isAccessLost(account({ isConnected: false }))).toBe(true);
  });
});

describe("resolveAccessLostAt", () => {
  it("null untuk akun sehat walau updatedAt sangat lama", () => {
    expect(resolveAccessLostAt(account({ updatedAt: daysAgo(400) }))).toBeNull();
  });

  it("memakai accessLostAt bila ada", () => {
    const at = daysAgo(10);
    expect(resolveAccessLostAt(account({ needsReconnect: true, accessLostAt: at }))).toBe(at);
  });

  it("accessLostAt menang atas updatedAt", () => {
    const at = daysAgo(40);
    const row = account({ needsReconnect: true, accessLostAt: at, updatedAt: daysAgo(1) });
    expect(resolveAccessLostAt(row)).toBe(at);
  });

  it("jatuh ke updatedAt untuk baris lama yang belum punya accessLostAt", () => {
    const row = account({ needsReconnect: true, accessLostAt: null, updatedAt: daysAgo(50) });
    expect(resolveAccessLostAt(row)).toBe(row.updatedAt);
  });
});

describe("retentionDeadline", () => {
  it("menambah jendela retensi dalam hari", () => {
    expect(retentionDeadline(new Date("2026-10-01T00:00:00.000Z")).toISOString()).toBe(
      "2026-10-31T00:00:00.000Z",
    );
  });

  it("menghormati jendela kustom", () => {
    expect(retentionDeadline(new Date("2026-10-01T00:00:00.000Z"), 7).toISOString()).toBe(
      "2026-10-08T00:00:00.000Z",
    );
  });
});

describe("isRetentionExpired", () => {
  it("akun sehat TIDAK pernah dihapus, apa pun umur datanya", () => {
    expect(isRetentionExpired(account({ updatedAt: daysAgo(1000) }), NOW)).toBe(false);
  });

  it("menahan akun yang aksesnya baru hilang", () => {
    const row = account({ needsReconnect: true, accessLostAt: daysAgo(29) });
    expect(isRetentionExpired(row, NOW)).toBe(false);
  });

  it("menghapus akun yang aksesnya hilang lebih dari jendela", () => {
    const row = account({ needsReconnect: true, accessLostAt: daysAgo(31) });
    expect(isRetentionExpired(row, NOW)).toBe(true);
  });

  it("tepat di batas sudah dianggap kedaluwarsa", () => {
    const row = account({ needsReconnect: true, accessLostAt: daysAgo(30) });
    expect(isRetentionExpired(row, NOW)).toBe(true);
  });

  it("memakai updatedAt untuk baris lama yang ditandai sebelum kolom ini ada", () => {
    const row = account({ needsReconnect: true, accessLostAt: null, updatedAt: daysAgo(31) });
    expect(isRetentionExpired(row, NOW)).toBe(true);
  });

  it("akun soft-disconnect ikut dibersihkan", () => {
    const row = account({ isConnected: false, accessLostAt: daysAgo(45) });
    expect(isRetentionExpired(row, NOW)).toBe(true);
  });

  it("menghormati jendela kustom yang lebih ketat", () => {
    const row = account({ needsReconnect: true, accessLostAt: daysAgo(8) });
    expect(isRetentionExpired(row, NOW, ACCESS_LOST_RETENTION_DAYS)).toBe(false);
    expect(isRetentionExpired(row, NOW, 7)).toBe(true);
  });
});

describe("jendela retensi", () => {
  it("30 hari — mengikuti batas terketat (YouTube)", () => {
    expect(ACCESS_LOST_RETENTION_DAYS).toBe(30);
  });
});
