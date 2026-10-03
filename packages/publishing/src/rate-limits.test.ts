import { describe, expect, it } from "vitest";
import {
  isThrottleError,
  metaAppKeyForUrl,
  parseMetaAppUsage,
  parseMetaBucUsage,
} from "./rate-limits";

describe("parseMetaAppUsage", () => {
  it("membaca bentuk riil header (angka datar, persen)", () => {
    // Nilai ini diambil dari respons Graph API v26.0 yang sesungguhnya.
    const usage = parseMetaAppUsage('{"call_count":14,"total_cputime":0,"total_time":0}');
    expect(usage).toEqual({ callCountPct: 14, cputimePct: 0, totalTimePct: 0 });
  });

  it("header kosong / null → null (bukan 0)", () => {
    expect(parseMetaAppUsage(null)).toBeNull();
    expect(parseMetaAppUsage(undefined)).toBeNull();
    expect(parseMetaAppUsage("")).toBeNull();
  });

  it("header korup tidak melempar", () => {
    expect(parseMetaAppUsage("bukan json")).toBeNull();
    expect(parseMetaAppUsage("[]")).toBeNull();
  });

  it("tanpa call_count → null (jangan mengarang angka)", () => {
    expect(parseMetaAppUsage('{"total_cputime":10}')).toBeNull();
  });
});

describe("parseMetaBucUsage", () => {
  it("menerima bentuk DATAR seperti contoh dokumentasi Meta", () => {
    const raw = JSON.stringify({
      "66782684": [
        {
          type: "ads_management",
          call_count: 95,
          total_cputime: 20,
          total_time: 20,
          estimated_time_to_regain_access: 0,
        },
      ],
    });
    const out = parseMetaBucUsage(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      entityId: "66782684",
      type: "ads_management",
      callCountPct: 95,
      regainAccessMinutes: 0,
    });
  });

  it("menerima bentuk BERSARANG (asumsi parser lama) supaya tidak regresi", () => {
    const raw = JSON.stringify({
      "1394761092170668": [
        {
          call_count: { total: 42, estimated_time_to_regain_full_access: 7 },
        },
      ],
    });
    const out = parseMetaBucUsage(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      entityId: "1394761092170668",
      callCountPct: 42,
      regainAccessMinutes: 7,
      type: null,
    });
  });

  it("membaca beberapa entitas dalam satu header", () => {
    const raw = JSON.stringify({
      app_a: [{ type: "pages", call_count: 10 }],
      app_b: [{ type: "instagram", call_count: 80 }],
    });
    const out = parseMetaBucUsage(raw);
    expect(out.map((e) => e.entityId).sort()).toEqual(["app_a", "app_b"]);
    expect(out.find((e) => e.entityId === "app_b")?.callCountPct).toBe(80);
  });

  it("entri tanpa call_count dilewati, header rusak → array kosong", () => {
    expect(parseMetaBucUsage(JSON.stringify({ a: [{ type: "pages" }] }))).toEqual([]);
    expect(parseMetaBucUsage("rusak")).toEqual([]);
    expect(parseMetaBucUsage(null)).toEqual([]);
  });
});

describe("metaAppKeyForUrl", () => {
  it("memetakan host ke kunci app (tiap app punya anggaran sendiri)", () => {
    expect(metaAppKeyForUrl("https://graph.facebook.com/v26.0/me")).toBe("meta_app_facebook");
    expect(metaAppKeyForUrl("https://graph.instagram.com/v26.0/me")).toBe(
      "meta_app_instagram_login",
    );
    expect(metaAppKeyForUrl("https://graph.threads.net/v1.0/me")).toBe("meta_app_threads");
  });

  it("host lain / URL tidak valid → kunci umum, bukan error", () => {
    expect(metaAppKeyForUrl("https://example.com/x")).toBe("meta_app");
    expect(metaAppKeyForUrl("bukan-url")).toBe("meta_app");
  });
});

describe("isThrottleError", () => {
  it("mengenali kode throttle Meta", () => {
    expect(isThrottleError("[32] Page request limit reached")).toBe(true);
    expect(isThrottleError("[4] Application request limit reached")).toBe(true);
    expect(isThrottleError("[17] User request limit reached")).toBe(true);
    expect(isThrottleError("[613] Custom rate limit reached")).toBe(true);
    expect(isThrottleError("[80001] too many calls to this Page account")).toBe(true);
  });

  it("mengenali frasa throttle platform lain", () => {
    expect(isThrottleError("Rate limit exceeded")).toBe(true);
    expect(isThrottleError("Too Many Requests")).toBe(true);
    expect(isThrottleError("request was throttled")).toBe(true);
  });

  it("TIDAK salah menandai error permintaan biasa sebagai throttle", () => {
    // Kesalahan penting: kode 100/190/400/404 bukan kuota habis. Salah tandai
    // membuat sync berhenti padahal masalahnya izin/konten.
    expect(isThrottleError("[100] Invalid parameter")).toBe(false);
    expect(isThrottleError("[190] Invalid OAuth access token")).toBe(false);
    expect(isThrottleError("[400] The value must be a valid insights metric")).toBe(false);
    expect(isThrottleError("[404] Not found")).toBe(false);
    expect(isThrottleError("media fetch failed (403)")).toBe(false);
    expect(isThrottleError(null)).toBe(false);
    expect(isThrottleError("")).toBe(false);
  });
});
