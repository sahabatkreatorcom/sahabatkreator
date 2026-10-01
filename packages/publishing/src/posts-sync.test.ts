import { describe, expect, it, vi } from "vitest";

// Helper yang diuji murni (tanpa DB) — mock supaya import posts-sync tidak
// membuat connection pool Postgres saat unit test berjalan.
vi.mock("@sahabatkreator/db", () => ({ db: {} }));
vi.mock("@sahabatkreator/db/schema", () => ({ post: {}, socialAccount: {} }));

const { externalPlatformSettingsPatch } = await import("./posts-sync");

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
