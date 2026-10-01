import { describe, expect, it, vi } from "vitest";

// Helper yang diuji murni (tanpa DB) — mock supaya import posts-sync tidak
// membuat connection pool Postgres saat unit test berjalan.
vi.mock("@sahabatkreator/db", () => ({ db: {} }));
vi.mock("@sahabatkreator/db/schema", () => ({ post: {}, socialAccount: {} }));

const { externalPlatformSettingsPatch, isUniqueViolationError } = await import("./posts-sync");

/**
 * Post eksternal menyimpan mediaType + mediaUrl di kolom jsonb `platform_settings`.
 * URL CDN Meta (Instagram/Threads) bertanda tangan dan KEDALUWARSA, jadi patch ini
 * harus selalu bisa dipakai untuk menyegarkan nilai lama — kalau tidak, tombol play
 * video akan mati setelah URL-nya habis masa berlaku.
 */
describe("externalPlatformSettingsPatch", () => {
  it("menyertakan mediaType dan mediaUrl untuk video", () => {
    const patch = externalPlatformSettingsPatch({
      mediaType: "VIDEO",
      mediaUrl: "https://scontent.cdninstagram.com/o1/v/abc.mp4?oe=6ABF688C",
    });
    expect(patch).toEqual({
      mediaType: "VIDEO",
      mediaUrl: "https://scontent.cdninstagram.com/o1/v/abc.mp4?oe=6ABF688C",
    });
  });

  it("menyertakan mediaUrl untuk gambar", () => {
    const patch = externalPlatformSettingsPatch({
      mediaType: "IMAGE",
      mediaUrl: "https://scontent.cdninstagram.com/v/t51/abc.jpg?oe=6AC374B1",
    });
    expect(patch.mediaType).toBe("IMAGE");
    expect(patch.mediaUrl).toBe("https://scontent.cdninstagram.com/v/t51/abc.jpg?oe=6AC374B1");
  });

  it("TIDAK menyertakan kunci mediaUrl untuk post teks", () => {
    const patch = externalPlatformSettingsPatch({ mediaType: "TEXT" });
    expect(patch).toEqual({ mediaType: "TEXT" });
    expect("mediaUrl" in patch).toBe(false);
  });

  it("TIDAK menyertakan mediaUrl saat nilainya kosong", () => {
    const patch = externalPlatformSettingsPatch({ mediaType: "VIDEO", mediaUrl: "" });
    expect("mediaUrl" in patch).toBe(false);
  });

  it("mengembalikan objek baru (tidak memutasi input)", () => {
    const input = { mediaType: "IMAGE" as const, mediaUrl: "https://x/y.jpg" };
    const patch = externalPlatformSettingsPatch(input);
    expect(patch).not.toBe(input);
    expect(input).toEqual({ mediaType: "IMAGE", mediaUrl: "https://x/y.jpg" });
  });

  it("hasilnya deterministik untuk input yang sama", () => {
    const ep = { mediaType: "CAROUSEL" as const, mediaUrl: "https://x/a.jpg" };
    expect(externalPlatformSettingsPatch(ep)).toEqual(externalPlatformSettingsPatch(ep));
  });
});

/**
 * Drizzle melempar `DrizzleQueryError` TANPA `code`; `code`/`constraint` asli ada
 * di `.cause`. Deteksi yang cuma membaca `err.code` selalu false, sehingga fallback
 * "insert → unique violation → update" tidak pernah jalan. Itu nyata terjadi di
 * produksi: post eksternal yang sudah pernah diimpor tidak pernah disegarkan lagi.
 */
describe("isUniqueViolationError", () => {
  it("mendeteksi error driver pg langsung (code di root)", () => {
    expect(isUniqueViolationError({ code: "23505" })).toBe(true);
  });

  it("mendeteksi DrizzleQueryError yang membungkus DatabaseError", () => {
    const drizzleError = new Error("Failed query: insert into \"post\" ...");
    (drizzleError as unknown as { cause?: unknown }).cause = {
      code: "23505",
      constraint: "post_org_external_uidx",
    };
    expect(isUniqueViolationError(drizzleError)).toBe(true);
  });

  it("mendeteksi pembungkusan berlapis", () => {
    expect(
      isUniqueViolationError({ cause: { cause: { cause: { code: "23505" } } } }),
    ).toBe(true);
  });

  it("mendeteksi lewat AggregateError.errors[]", () => {
    expect(isUniqueViolationError({ errors: [{ code: "23505" }] })).toBe(true);
  });

  it("mengabaikan kode SQLSTATE lain", () => {
    expect(isUniqueViolationError({ cause: { code: "23503" } })).toBe(false);
    expect(isUniqueViolationError({ cause: { code: "42P01" } })).toBe(false);
  });

  it("aman untuk nilai non-error", () => {
    expect(isUniqueViolationError(null)).toBe(false);
    expect(isUniqueViolationError(undefined)).toBe(false);
    expect(isUniqueViolationError("boom")).toBe(false);
    expect(isUniqueViolationError(42)).toBe(false);
  });

  it("berhenti menelusuri rantai cause yang sangat panjang (tidak rekursi tak terbatas)", () => {
    let deep: { cause?: unknown } = { cause: { code: "23505" } };
    for (let i = 0; i < 20; i++) deep = { cause: deep };
    expect(isUniqueViolationError(deep)).toBe(false);
  });
});
