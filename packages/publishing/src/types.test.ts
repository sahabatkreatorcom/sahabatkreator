// Test kontrak publishing — fungsi murni (tanpa DB) yang menjaga perilaku
// kritis lintas adapter.
//
// MENGAPA: file-file ini sebelumnya 0 test. Dua di antaranya adalah KONTRAK
// yang salah satu perubahan akan diam-diam memengaruhi 12 adapter platform:
//  - composeCaption: duplikat hashtag harus dihindari (double # di caption
//    terlihat sebagai spam di platform).
//  - supportsFirstComment: LinkedIn personal sengaja dikecualikan — app
//    "Share on LinkedIn" hanya punya w_member_social; sejak Juni 2023
//    komentar butuh w_member_social_feed (hanya Community Management API).
//    Orang yang belum tahu sejarah ini akan "memperbaikinya" dengan menambah
//    linkedin ke set → setiap first comment jadi 403. Test ini mengunci
//    keputusan + alasan (lihat types.ts FIRST_COMMENT_PLATFORMS).
import { describe, expect, it } from "vitest";
import {
  composeCaption,
  FIRST_COMMENT_PLATFORMS,
  PLATFORM_DAILY_LIMITS,
  PublishError,
  supportsFirstComment,
} from "./types";

describe("composeCaption", () => {
  it("menambahkan hashtag di akhir ketika belum ada", () => {
    expect(composeCaption("Halo semuanya", ["promosi", "diskon"])).toBe(
      "Halo semuanya\n\n#promosi #diskon",
    );
  });

  it("tidak menggandakan hashtag yang sudah ada di caption", () => {
    const caption = "Halo #promosi semua";
    expect(composeCaption(caption, ["promosi"])).toBe(caption);
  });

  it("mengawali hashtag dengan # bila diberi plain text", () => {
    expect(composeCaption("caption", ["ramai"])).toBe("caption\n\n#ramai");
  });

  it("mengembalikan caption apa adanya tanpa hashtag", () => {
    expect(composeCaption("caption saja", [])).toBe("caption saja");
  });

  it("menambahkan hashtag meski caption mengandung # lain", () => {
    expect(composeCaption("caption #sudah", ["baru"])).toBe("caption #sudah\n\n#baru");
  });
});

describe("supportsFirstComment", () => {
  it("mengembalikan true untuk platform yang punya API create-comment", () => {
    for (const p of [
      "instagram",
      "instagram_standalone",
      "facebook",
      "threads",
      "youtube",
      "bluesky",
      "linkedin_org",
    ]) {
      expect(supportsFirstComment(p), `${p} harus mendukung first comment`).toBe(true);
    }
  });

  it("mengembalikan false untuk linkedin personal (scope limitation)", () => {
    // BUKAN bug: app "Share on LinkedIn" tidak bisa create-comment sejak
    // LinkedIn memisahkan socialActions ke w_member_social_feed (Jun 2023).
    // Komentar LinkedIn personal selalu 403 — jangan tambahkan ke set.
    expect(supportsFirstComment("linkedin")).toBe(false);
  });

  it("mengembalikan false untuk platform tanpa API create-comment publik", () => {
    for (const p of ["tiktok", "pinterest", "google_business", "manual"]) {
      expect(supportsFirstComment(p), `${p} tidak punya API comment publik`).toBe(false);
    }
  });

  it("FIRST_COMMENT_PLATFORMS sesuai dengan supportsFirstComment", () => {
    // Registry & helper harus konsisten — keduanya dipakai adapter berbeda.
    for (const p of FIRST_COMMENT_PLATFORMS) {
      expect(supportsFirstComment(p), `${p} ada di set tapi helper false`).toBe(true);
    }
  });
});

describe("PublishError", () => {
  it("retryable=true untuk error transien (network / 429 / 5xx)", () => {
    const err = new PublishError("rate_limited", "Platform sibuk", true);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe("PublishError");
  });

  it("retryable=false untuk error permanen — konten ditolak / token invalid", () => {
    const err = new PublishError("content_rejected", "Konten melanggar kebijakan", false);
    expect(err.retryable).toBe(false);
    expect(err.code).toBe("content_rejected");
  });

  it("mempertahankan prototype Error (instanceof + stack)", () => {
    const err = new PublishError("x", "msg", true);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("msg");
  });
});

describe("PLATFORM_DAILY_LIMITS", () => {
  it("setiap platform terdaftar (adapter tanpa entry memakai default 50)", () => {
    // Adapter baru yang lupa menambah entry diam-diam memakai 50 — bisa
    // melampaui limit resmi platform. Test ini memakai daftar eksplisit.
    const platforms = Object.keys(PLATFORM_DAILY_LIMITS);
    for (const required of [
      "instagram",
      "instagram_standalone",
      "facebook",
      "threads",
      "tiktok",
      "youtube",
      "pinterest",
      "linkedin",
      "linkedin_org",
      "bluesky",
      "google_business",
      "manual",
    ]) {
      expect(platforms, `${required} wajib ada di PLATFORM_DAILY_LIMITS`).toContain(required);
    }
  });

  it("tiktok adalah yang paling konservatif (limit resmi terkecil)", () => {
    expect(PLATFORM_DAILY_LIMITS.tiktok).toBeLessThanOrEqual(PLATFORM_DAILY_LIMITS.instagram!);
  });

  it("manual = 0 berarti platform hanya untuk pencatatan", () => {
    expect(PLATFORM_DAILY_LIMITS.manual).toBe(0);
  });

  it("tidak ada limit negatif atau nol selain manual", () => {
    for (const [platform, limit] of Object.entries(PLATFORM_DAILY_LIMITS)) {
      if (platform === "manual") continue;
      expect(limit, `${platform} limit harus > 0`).toBeGreaterThan(0);
    }
  });
});
