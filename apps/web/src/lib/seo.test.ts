// Unit test helper SEO — toAbsoluteUrl (anti dobel URL) + detectImageMime
import { describe, expect, it } from "vitest";
import { detectImageMime, toAbsoluteUrl } from "./seo";

describe("toAbsoluteUrl", () => {
  it("mengembalikan URL absolut apa adanya (tidak dobel prefix)", () => {
    const r2Url = "https://pub-xxx.r2.dev/blog/cover.jpg";
    expect(toAbsoluteUrl(r2Url)).toBe(r2Url);
  });

  it("menggabungkan SITE_URL dengan path relatif", () => {
    expect(toAbsoluteUrl("/logo.png")).toMatch(/^https?:\/\//);
    expect(toAbsoluteUrl("/logo.png")).toMatch(/\/logo\.png$/);
  });

  it("menambahkan slash untuk path tanpa leading slash", () => {
    expect(toAbsoluteUrl("logo.png")).toMatch(/\/logo\.png$/);
  });

  it("tidak menghasilkan dobel slash saat SITE_URL berakhiran /", () => {
    // SITE_URL dibaca dari env saat import — cukup pastikan hasil tidak
    // mengandung "//" di tengah path
    const result = toAbsoluteUrl("/logo.png");
    expect(result).not.toMatch(/[^:]\/\//);
  });
});

describe("detectImageMime", () => {
  it("deteksi jpeg dari .jpg dan .jpeg (case-insensitive)", () => {
    expect(detectImageMime("https://r2.dev/a/cover.jpg")).toBe("image/jpeg");
    expect(detectImageMime("https://r2.dev/a/cover.JPEG")).toBe("image/jpeg");
  });

  it("deteksi webp, gif, svg", () => {
    expect(detectImageMime("https://r2.dev/a/x.webp")).toBe("image/webp");
    expect(detectImageMime("https://r2.dev/a/x.gif")).toBe("image/gif");
    expect(detectImageMime("https://r2.dev/a/x.svg")).toBe("image/svg+xml");
  });

  it("abaikan query string dan fragment saat deteksi ekstensi", () => {
    expect(detectImageMime("https://r2.dev/a/x.jpg?w=1200&h=630")).toBe("image/jpeg");
    expect(detectImageMime("https://r2.dev/a/x.png#anchor")).toBe("image/png");
  });

  it("fallback image/png untuk URL tanpa ekstensi", () => {
    expect(detectImageMime("https://r2.dev/a/no-extension")).toBe("image/png");
  });
});
